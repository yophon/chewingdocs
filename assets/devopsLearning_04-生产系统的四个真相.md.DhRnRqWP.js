import{c as n,Q as a,j as p,m as l}from"./chunks/framework.Bhbi9jCp.js";const q=JSON.parse('{"title":"生产系统的四个真相:没有 100% 可用 / 失败是常态 / 自动化 / 复盘文化","description":"","frontmatter":{},"headers":[],"relativePath":"devopsLearning/04-生产系统的四个真相.md","filePath":"devopsLearning/04-生产系统的四个真相.md","lastUpdated":1778496697000}'),e={name:"devopsLearning/04-生产系统的四个真相.md"};function i(t,s,o,c,u,r){return a(),p("div",null,[...s[0]||(s[0]=[l(`<h1 id="生产系统的四个真相-没有-100-可用-失败是常态-自动化-复盘文化" tabindex="-1">生产系统的四个真相:没有 100% 可用 / 失败是常态 / 自动化 / 复盘文化 <a class="header-anchor" href="#生产系统的四个真相-没有-100-可用-失败是常态-自动化-复盘文化" aria-label="Permalink to &quot;生产系统的四个真相:没有 100% 可用 / 失败是常态 / 自动化 / 复盘文化&quot;">​</a></h1><p>这一层最后一篇,<strong>讲四件工程师本能上不愿意接受的事</strong>。第一篇讲 SRE 是什么,第二篇讲 Google 给的范式,第三篇讲可观测性能力,<strong>到这一篇,我们要承认四个反直觉的真相</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>真相 1:没有 100% 可用,99.99% 都已经是奢侈品</span></span>
<span class="line"><span>真相 2:失败是常态,你的代码必须为失败设计</span></span>
<span class="line"><span>真相 3:能自动化的别让人做,但盲目自动化会造新 Toil</span></span>
<span class="line"><span>真相 4:复盘 blameless,把&quot;骂人&quot;换成&quot;修流程&quot;</span></span></code></pre></div><p><strong>这四件事,工程师本能上抗拒</strong>:谁愿意承认自己写的代码&quot;必然会挂&quot;?谁愿意接受&quot;自动化也会出问题&quot;?谁愿意在复盘里&quot;不追究犯错的人&quot;?<strong>但这四件事不接受,SRE 工程就建不起来</strong>——前 3 篇讲的所有概念都是建立在这 4 个真相之上的。<strong>这一篇就是把这 4 个真相摊开,逐个讲清楚&quot;为什么必须接受,以及接受之后该做什么&quot;</strong>。</p><blockquote><p>一句话先记住:<strong>SRE 工程的所有方法学,本质都在围绕这 4 个真相做工程化</strong>——错误预算是&quot;承认真相 1 + 真相 2 之后的算术工具&quot;、混沌工程是&quot;接受真相 2 之后的训练工具&quot;、自愈系统是&quot;理解真相 3 之后的克制工具&quot;、Blameless Postmortem 是&quot;实践真相 4 之后的组织工具&quot;。<strong>任何一个团队不接受这 4 个真相,后面 30 篇的工程都是装饰品</strong>。所以这一篇放在第一层结尾,要让你<strong>心里真的认这 4 件事</strong>,不只是嘴上认。</p></blockquote><hr><h2 id="一、引子-四个真相为什么反直觉" tabindex="-1">一、引子:四个真相为什么反直觉 <a class="header-anchor" href="#一、引子-四个真相为什么反直觉" aria-label="Permalink to &quot;一、引子:四个真相为什么反直觉&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工程师的本能假设(都是错的):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  &quot;我代码写好了,系统就能 100% 跑&quot;</span></span>
<span class="line"><span>   → 真相 1:不可能 100%,工程现实让物理学定理生效</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  &quot;异常 / 失败是少见情况&quot;</span></span>
<span class="line"><span>   → 真相 2:在分布式系统里,失败是常态,成功是巧合</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  &quot;自动化就是好,越多越好&quot;</span></span>
<span class="line"><span>   → 真相 3:自动化的代价被严重低估,盲目自动化制造新问题</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  &quot;出事要追责任,知道是谁的错才能改进&quot;</span></span>
<span class="line"><span>   → 真相 4:追责文化只会让信息隐藏,反而妨碍改进</span></span></code></pre></div><p><strong>这 4 个假设是工程师从校园 + 单体应用时代带过来的&quot;惯性&quot;</strong>。在玩具系统里它们看着是对的——一个 Web 应用 100 个用户 10 个并发,确实 99% 时间能跑;失败确实是少见;脚本写完跑得很爽;出错就是某人的代码 bug。<strong>但生产系统不是玩具</strong>——10000 QPS、100 个微服务、数十个依赖、跨可用区部署的世界,这 4 个假设全部失效。</p><p><strong>这一篇就是把工程师的&quot;玩具世界惯性&quot;切掉,装上&quot;生产系统的物理学&quot;</strong>。</p><hr><h2 id="二、真相-1-没有-100-可用-99-99-都奢侈" tabindex="-1">二、真相 1:没有 100% 可用,99.99% 都奢侈 <a class="header-anchor" href="#二、真相-1-没有-100-可用-99-99-都奢侈" aria-label="Permalink to &quot;二、真相 1:没有 100% 可用,99.99% 都奢侈&quot;">​</a></h2><h3 id="_2-1-算术先讲清楚" tabindex="-1">2.1 算术先讲清楚 <a class="header-anchor" href="#_2-1-算术先讲清楚" aria-label="Permalink to &quot;2.1 算术先讲清楚&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不同可用性的&quot;全年可不可用时间&quot;:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  99%       =  3.65 天/年        = 7.2 小时/月</span></span>
<span class="line"><span>  99.5%     =  1.83 天/年        = 3.6 小时/月</span></span>
<span class="line"><span>  99.9%     =  8.76 小时/年      = 43.2 分钟/月</span></span>
<span class="line"><span>  99.95%    =  4.38 小时/年      = 21.6 分钟/月</span></span>
<span class="line"><span>  99.99%    =  52.6 分钟/年      = 4.32 分钟/月</span></span>
<span class="line"><span>  99.999%   =  5.26 分钟/年      = 25.9 秒/月    ← 这就是传说中的&quot;5 个 9&quot;</span></span>
<span class="line"><span>  99.9999%  =  31.5 秒/年        = 2.6 秒/月    ← 几乎物理上做不到</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么 100% 永远做不到?</span></span>
<span class="line"><span>   - 物理硬件会坏(MTBF 是有限的)</span></span>
<span class="line"><span>   - 软件有 bug(代码量足够多必然有缺陷)</span></span>
<span class="line"><span>   - 网络不可靠(光纤会被挖断、BGP 会路由错)</span></span>
<span class="line"><span>   - 人会犯错(操作失误)</span></span>
<span class="line"><span>   - 自然灾害(地震 / 洪水 / 停电)</span></span>
<span class="line"><span>   - 维护窗口(任何升级都有窗口)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>数学上的极限:</span></span>
<span class="line"><span>   - 计算机系统的可用性 = 各部件可用性的乘积</span></span>
<span class="line"><span>   - 任何一个 &lt; 1 的乘积永远 &lt; 1</span></span>
<span class="line"><span>   - 100% 是数学不可达的极限</span></span></code></pre></div><h3 id="_2-2-谁能做到-99-99-99-999" tabindex="-1">2.2 谁能做到 99.99% / 99.999% <a class="header-anchor" href="#_2-2-谁能做到-99-99-99-999" aria-label="Permalink to &quot;2.2 谁能做到 99.99% / 99.999%&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>能做到 99.99%(年 52 分钟)的:</span></span>
<span class="line"><span>   - 一线云厂商(AWS / GCP / Azure 的 IaaS)</span></span>
<span class="line"><span>     ← 也是因为他们自己签 SLA 限定了&quot;故障定义&quot;</span></span>
<span class="line"><span>   - 中型互联网公司核心服务(支付 / 交易)</span></span>
<span class="line"><span>     ← 投入巨大:多 AZ + 多 region + 7x24 NOC + 上千万年成本</span></span>
<span class="line"><span></span></span>
<span class="line"><span>能做到 99.999%(年 5 分钟)的:</span></span>
<span class="line"><span>   - 电信级系统(交换机 / IMS)</span></span>
<span class="line"><span>   - 金融核心系统(银行结算)</span></span>
<span class="line"><span>   - 都是几十年迭代 + 专门硬件 + 冗余冗余再冗余</span></span>
<span class="line"><span></span></span>
<span class="line"><span>做不到 99.99% 但很多人喊的:</span></span>
<span class="line"><span>   - 95% 国内 SaaS 公司</span></span>
<span class="line"><span>   - 几乎所有创业公司</span></span>
<span class="line"><span>   - 一切&quot;个位数 SRE 编制&quot;的团队</span></span></code></pre></div><p><strong>国内最常见的现实</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>小厂:实际 99% - 99.5%(一个月 3-7 小时不可用)</span></span>
<span class="line"><span>       → 但销售喊 99.9% / 99.95%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>中厂:实际 99.5% - 99.9%(一个月 40 分钟 - 3 小时)</span></span>
<span class="line"><span>       → 销售喊 99.9% / 99.99%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>大厂核心:实际 99.95% - 99.99%</span></span>
<span class="line"><span>       → 销售喊 99.99% / 99.999%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 业界普遍现象:实际可用性比承诺低 1-2 个 9</span></span>
<span class="line"><span>→ 一旦客户认真对账,违约赔款必然发生</span></span></code></pre></div><h3 id="_2-3-一个真实-可虚构但-plausible-场景" tabindex="-1">2.3 一个真实(可虚构但 plausible)场景 <a class="header-anchor" href="#_2-3-一个真实-可虚构但-plausible-场景" aria-label="Permalink to &quot;2.3 一个真实(可虚构但 plausible)场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队 5 人,SaaS 工具,月销 ¥100 万</span></span>
<span class="line"><span>销售给企业客户写合同:</span></span>
<span class="line"><span>   &quot;服务可用性 SLA: 99.95%(月度)&quot;</span></span>
<span class="line"><span>工程师们看了一眼,签字:</span></span>
<span class="line"><span>   &quot;应该没问题,我们 prod 看起来都挺稳&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第一个月:</span></span>
<span class="line"><span>   - 周二某次发布因配置错误,服务挂 25 分钟</span></span>
<span class="line"><span>   - 第二周某次 RDS 主从切换,业务感知 8 分钟</span></span>
<span class="line"><span>   - 第三周 CDN 厂商抽风,部分用户访问失败 20 分钟</span></span>
<span class="line"><span>   合计:53 分钟不可用</span></span>
<span class="line"><span>   实际可用性:99.88%</span></span>
<span class="line"><span>   SLA 99.95% 允许:21.6 分钟</span></span>
<span class="line"><span>   超支:31.4 分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第二个月:</span></span>
<span class="line"><span>   - 类似的 4-5 次小事件,合计 70 分钟</span></span>
<span class="line"><span>   实际可用性:99.84%</span></span>
<span class="line"><span>   连续两月违约</span></span>
<span class="line"><span></span></span>
<span class="line"><span>季度末客户来对账:</span></span>
<span class="line"><span>   &quot;你们这季度有 ~150 分钟不可用&quot;</span></span>
<span class="line"><span>   &quot;按合同 SLA 99.95%,允许 65 分钟&quot;</span></span>
<span class="line"><span>   &quot;超出 85 分钟,按合同月费 20% 赔付&quot;</span></span>
<span class="line"><span>   &quot;本季度退款 ¥60 万,占你们这家月销 60%&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>工程师团队:</span></span>
<span class="line"><span>   - &quot;我们以为 99.95% 够保守了&quot;</span></span>
<span class="line"><span>   - &quot;其实没认真算过&quot;</span></span>
<span class="line"><span>   - &quot;也没人跟我们说 SLA = SLO 是错的&quot;</span></span>
<span class="line"><span>   - &quot;现在 ¥60 万怎么办?&quot;</span></span></code></pre></div><p><strong>这个场景的核心错误</strong>:<strong>销售用&quot;听起来不错&quot;的数字签 SLA,工程师没认真算过这个数字意味着什么</strong>。99.95% 不是&quot;听起来挺好&quot;,是&quot;每月只能挂 21 分钟&quot;,<strong>一次发布失败的回滚就用完了</strong>。</p><h3 id="_2-4-怎么定-slo-核心-vs-边缘的不同标准" tabindex="-1">2.4 怎么定 SLO:核心 vs 边缘的不同标准 <a class="header-anchor" href="#_2-4-怎么定-slo-核心-vs-边缘的不同标准" aria-label="Permalink to &quot;2.4 怎么定 SLO:核心 vs 边缘的不同标准&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>正确的&quot;分层 SLO&quot;:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>核心服务(交易 / 支付 / 登录):</span></span>
<span class="line"><span>   SLO 99.9%(月 43 分钟)</span></span>
<span class="line"><span>   SLA 99.5%(月 3.6 小时)</span></span>
<span class="line"><span>   缓冲:2.7 小时,够&quot;修一次故障&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>辅助服务(消息推送 / 通知):</span></span>
<span class="line"><span>   SLO 99.5%(月 3.6 小时)</span></span>
<span class="line"><span>   SLA 99%(月 7.2 小时)</span></span>
<span class="line"><span>   缓冲:3.6 小时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>边缘服务(管理后台 / 报表):</span></span>
<span class="line"><span>   SLO 99%(月 7.2 小时)</span></span>
<span class="line"><span>   SLA 95%(月 36 小时)</span></span>
<span class="line"><span>   或者不签 SLA(只是&quot;尽力维护&quot;)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实验服务:</span></span>
<span class="line"><span>   无 SLO</span></span>
<span class="line"><span>   工程师自己用,出事自己负责</span></span></code></pre></div><p><strong>这个分层的原则</strong>:<strong>核心服务定高 SLO + 比 SLA 留 2-4 倍缓冲</strong>。<strong>任何把 SLA = SLO 的合同都是定时炸弹</strong>。</p><h3 id="_2-5-接受真相-1-之后该做的事" tabindex="-1">2.5 接受真相 1 之后该做的事 <a class="header-anchor" href="#_2-5-接受真相-1-之后该做的事" aria-label="Permalink to &quot;2.5 接受真相 1 之后该做的事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 算清楚自己服务的&quot;真实&quot;可用性</span></span>
<span class="line"><span>   - 过去 90 天到底挂了多少分钟</span></span>
<span class="line"><span>   - 不要凭印象,看 Prometheus 历史数据</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 用真实数据反推合理的 SLO</span></span>
<span class="line"><span>   - 实际 99.5% 的服务,不要喊 99.95%</span></span>
<span class="line"><span>   - SLO 略高于实际,给改进空间</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. SLO 和 SLA 必须严格分开</span></span>
<span class="line"><span>   - SLA 是给客户的(法律承诺)</span></span>
<span class="line"><span>   - SLO 是给团队的(工程目标)</span></span>
<span class="line"><span>   - SLO &gt; SLA,差距 = 缓冲</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 销售给客户报 SLA 前必须工程师签字</span></span>
<span class="line"><span>   - 这是个工程问题,不是商务问题</span></span>
<span class="line"><span>   - 财务损失最终是工程问题</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 教育业务方:&quot;100% 不存在&quot;</span></span>
<span class="line"><span>   - 任何关于&quot;零宕机&quot;的承诺都是空头支票</span></span>
<span class="line"><span>   - 设计要为&quot;会挂&quot;做准备,而不是&quot;假设不挂&quot;</span></span></code></pre></div><hr><h2 id="三、真相-2-失败是常态-design-for-failure" tabindex="-1">三、真相 2:失败是常态,Design for Failure <a class="header-anchor" href="#三、真相-2-失败是常态-design-for-failure" aria-label="Permalink to &quot;三、真相 2:失败是常态,Design for Failure&quot;">​</a></h2><h3 id="_3-1-工程师本能的-乐观假设" tabindex="-1">3.1 工程师本能的&quot;乐观假设&quot; <a class="header-anchor" href="#_3-1-工程师本能的-乐观假设" aria-label="Permalink to &quot;3.1 工程师本能的&quot;乐观假设&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>代码里常见的&quot;乐观假设&quot;:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  result = httpClient.get(&quot;https://api.payment.com/charge&quot;)</span></span>
<span class="line"><span>  return result.json()[&quot;transaction_id&quot;]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ← 默认假设:</span></span>
<span class="line"><span>    - 网络永远通</span></span>
<span class="line"><span>    - 对端永远活</span></span>
<span class="line"><span>    - 响应永远是 JSON</span></span>
<span class="line"><span>    - JSON 里永远有 transaction_id</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  实际可能发生的:</span></span>
<span class="line"><span>    - DNS 解析失败(对端 IP 改了 / 你的 DNS 挂了)</span></span>
<span class="line"><span>    - TCP 连接超时(对端慢 / 防火墙)</span></span>
<span class="line"><span>    - HTTP 5xx(对端在重启 / 流控)</span></span>
<span class="line"><span>    - 响应不是 JSON(对端在维护页 / 出错)</span></span>
<span class="line"><span>    - JSON 缺字段(协议升级 / 部分失败)</span></span>
<span class="line"><span>    - JSON 字段类型不对(脏数据)</span></span>
<span class="line"><span>    - 响应慢得离谱(对端高负载,latency 30s)</span></span></code></pre></div><p><strong>绝大多数 bug 不是逻辑错,是&quot;对失败的不准备&quot;</strong>——在玩具系统里这些都不会发生,在生产系统里这些每分钟都在发生。</p><h3 id="_3-2-分布式系统里-失败的种类" tabindex="-1">3.2 分布式系统里&quot;失败的种类&quot; <a class="header-anchor" href="#_3-2-分布式系统里-失败的种类" aria-label="Permalink to &quot;3.2 分布式系统里&quot;失败的种类&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>按失败的&quot;快慢&quot;分:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  快失败(Fast Failure):</span></span>
<span class="line"><span>   - 连接拒绝(TCP RST / &quot;connection refused&quot;)</span></span>
<span class="line"><span>   - DNS 解析失败</span></span>
<span class="line"><span>   - 立即 5xx</span></span>
<span class="line"><span>   特点:错误明显、能立即重试</span></span>
<span class="line"><span>   危害:相对低(知道是错)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  慢失败(Slow Failure):</span></span>
<span class="line"><span>   - TCP 连上但没回包(超时 30s)</span></span>
<span class="line"><span>   - 响应慢(latency 飙到 10s)</span></span>
<span class="line"><span>   - 数据库 deadlock 卡住</span></span>
<span class="line"><span>   特点:错误不明显、容易拖累上游</span></span>
<span class="line"><span>   危害:高(会引发雪崩)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>按&quot;影响范围&quot;分:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  全失败(Full Failure):</span></span>
<span class="line"><span>   - 对端进程死了,所有请求都失败</span></span>
<span class="line"><span>   特点:监控容易发现</span></span>
<span class="line"><span>   危害:有限(降级 fallback 容易触发)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  部分失败(Partial Failure):</span></span>
<span class="line"><span>   - 某个 AZ 挂了,30% 请求失败</span></span>
<span class="line"><span>   - 某条 SQL 慢,50% 请求超时</span></span>
<span class="line"><span>   特点:监控不容易发现(平均值看起来还行)</span></span>
<span class="line"><span>   危害:高(掩盖在&quot;整体看起来 OK&quot;里)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  灰失败(Gray Failure):</span></span>
<span class="line"><span>   - 对部分用户失败(某个 region / 某种特征)</span></span>
<span class="line"><span>   - 对部分请求失败(某个 endpoint / 某种参数)</span></span>
<span class="line"><span>   特点:监控很难发现,需要细粒度切片</span></span>
<span class="line"><span>   危害:极高(用户已经骂街,内部还没报警)</span></span></code></pre></div><p><strong>灰失败是分布式系统最阴险的失败模式</strong>——你的 dashboard 一片绿,客服群已经炸了。<strong>第二层(可观测性)的核心价值之一就是&quot;能识别灰失败&quot;</strong>。</p><h3 id="_3-3-一个真实-可虚构但-plausible-场景" tabindex="-1">3.3 一个真实(可虚构但 plausible)场景 <a class="header-anchor" href="#_3-3-一个真实-可虚构但-plausible-场景" aria-label="Permalink to &quot;3.3 一个真实(可虚构但 plausible)场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队 8 人,电商,周三下午搞营销大促:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>13:00 大促开始,QPS 从 1000 飙到 5000</span></span>
<span class="line"><span>13:05 订单服务 P99 开始波动</span></span>
<span class="line"><span>13:15 RDS 主库 CPU 95%</span></span>
<span class="line"><span>13:20 监控告警:&quot;RDS CPU 高&quot;</span></span>
<span class="line"><span>13:22 DBA 切到 read replica,主库压力下降</span></span>
<span class="line"><span>13:25 但应用服务突然 5xx 率 30%</span></span>
<span class="line"><span>        ← 原因:主从切换 30 秒,期间应用连接的还是旧 master</span></span>
<span class="line"><span>        ← 旧 master 已经在 read-only 模式,写操作全失败</span></span>
<span class="line"><span>13:30 应用层 retry 全失败 + 缓存击穿 + 上游服务超时</span></span>
<span class="line"><span>13:35 雪崩,整个交易链路挂掉</span></span>
<span class="line"><span>14:00 凑齐 SRE / 后端 / DBA,逐个救</span></span>
<span class="line"><span>14:30 通过重启服务清掉脏连接,恢复 50%</span></span>
<span class="line"><span>15:00 完全恢复</span></span>
<span class="line"><span>       事故时长 1 小时 40 分钟</span></span>
<span class="line"><span>       损失:大促当天预计 GMV 800 万,实际 200 万</span></span>
<span class="line"><span></span></span>
<span class="line"><span>复盘根因:</span></span>
<span class="line"><span>   表层:RDS 切换时应用没正确处理 &quot;短暂连接失败&quot;</span></span>
<span class="line"><span>   深层:应用代码没有 retry / fallback / 熔断 / 优雅降级</span></span>
<span class="line"><span>   根因:**代码假设依赖永不失败**,</span></span>
<span class="line"><span>         没有按 Design for Failure 设计</span></span></code></pre></div><p><strong>这个场景的核心</strong>:依赖系统的&quot;切换&quot;是计划内的、正常的、必然发生的操作,但应用没有为它准备。<strong>这种&quot;对失败的不准备&quot;在生产系统里每天都在制造事故</strong>。</p><h3 id="_3-4-design-for-failure-的工程实践" tabindex="-1">3.4 Design for Failure 的工程实践 <a class="header-anchor" href="#_3-4-design-for-failure-的工程实践" aria-label="Permalink to &quot;3.4 Design for Failure 的工程实践&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原则 1:超时(Timeout)</span></span>
<span class="line"><span>   每个外部调用必须设超时</span></span>
<span class="line"><span>   - HTTP 调用:5-10s(取决于业务)</span></span>
<span class="line"><span>   - DB 查询:1-3s</span></span>
<span class="line"><span>   - 缓存查询:100-500ms</span></span>
<span class="line"><span>   - 没设超时 = 等于设了无限超时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原则 2:重试(Retry)</span></span>
<span class="line"><span>   失败时重试,但要&quot;聪明的重试&quot;</span></span>
<span class="line"><span>   - 指数退避(exponential backoff)</span></span>
<span class="line"><span>   - 上限重试次数(3-5 次)</span></span>
<span class="line"><span>   - 区分&quot;可重试错误&quot;和&quot;不可重试错误&quot;</span></span>
<span class="line"><span>     ← 4xx 通常不可重试,5xx 通常可重试</span></span>
<span class="line"><span>   - 重试要加 jitter(抖动)防&quot;惊群&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原则 3:熔断(Circuit Breaker)</span></span>
<span class="line"><span>   连续失败到一定阈值,停止尝试</span></span>
<span class="line"><span>   - 防止&quot;无脑重试&quot;打死下游</span></span>
<span class="line"><span>   - 给下游&quot;恢复&quot;的时间</span></span>
<span class="line"><span>   - Hystrix / resilience4j / Sentinel 都是这套</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原则 4:降级(Fallback)</span></span>
<span class="line"><span>   失败时返回&quot;次优响应&quot;而不是直接报错</span></span>
<span class="line"><span>   - 缓存的旧数据</span></span>
<span class="line"><span>   - 默认值</span></span>
<span class="line"><span>   - 通知用户&quot;功能暂不可用,但其他功能正常&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原则 5:Bulkhead(舱壁隔离)</span></span>
<span class="line"><span>   不同上游用不同连接池 / 线程池</span></span>
<span class="line"><span>   - 一个上游挂不连累其他</span></span>
<span class="line"><span>   - 类似船的舱壁:一个舱进水其他舱不沉</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原则 6:幂等(Idempotency)</span></span>
<span class="line"><span>   同一个请求重复执行结果一样</span></span>
<span class="line"><span>   - 重试不会重复扣款</span></span>
<span class="line"><span>   - 失败后客户端可以放心重发</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原则 7:多副本 + 多 AZ + 多 region</span></span>
<span class="line"><span>   架构层面的冗余</span></span>
<span class="line"><span>   - 单 AZ 挂还能跑</span></span>
<span class="line"><span>   - 整个 region 挂能 failover</span></span>
<span class="line"><span>   - 这是钱堆出来的(每多一份成本翻倍)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原则 8:优雅降级</span></span>
<span class="line"><span>   核心功能保留,边缘功能直接 503</span></span>
<span class="line"><span>   - 大促时关掉&quot;个性化推荐&quot;保住&quot;下单&quot;</span></span>
<span class="line"><span>   - 区分&quot;必要&quot;和&quot;锦上添花&quot;</span></span></code></pre></div><h3 id="_3-5-不要追求-永不失败" tabindex="-1">3.5 不要追求&quot;永不失败&quot; <a class="header-anchor" href="#_3-5-不要追求-永不失败" aria-label="Permalink to &quot;3.5 不要追求&quot;永不失败&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误的目标:&quot;系统永远不挂&quot;</span></span>
<span class="line"><span>   → 物理不可达,徒劳</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确的目标:&quot;系统挂的时候优雅&quot;</span></span>
<span class="line"><span>   → 失败可恢复</span></span>
<span class="line"><span>   → 失败影响小</span></span>
<span class="line"><span>   → 失败被快速发现</span></span>
<span class="line"><span>   → 失败被快速修复</span></span>
<span class="line"><span></span></span>
<span class="line"><span>具体体现:</span></span>
<span class="line"><span>  快失败 ←→ 慢失败:**快失败永远比慢失败好**</span></span>
<span class="line"><span>   失败立即报错,上游能 fallback</span></span>
<span class="line"><span>   慢失败拖延上游线程,引发雪崩</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  全失败 ←→ 部分失败:**全失败比部分失败好(矛盾的)**</span></span>
<span class="line"><span>   全失败容易触发自动降级</span></span>
<span class="line"><span>   部分失败被掩盖,反而扩散</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  能恢复 ←→ 不能恢复:**能 self-heal 是核心目标**</span></span>
<span class="line"><span>   重启能修 &gt; 需要人介入</span></span>
<span class="line"><span>   重试能修 &gt; 重启</span></span>
<span class="line"><span>   缓存能扛 &gt; 上游必修</span></span></code></pre></div><h3 id="_3-6-接受真相-2-之后该做的事" tabindex="-1">3.6 接受真相 2 之后该做的事 <a class="header-anchor" href="#_3-6-接受真相-2-之后该做的事" aria-label="Permalink to &quot;3.6 接受真相 2 之后该做的事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. PR review 加一个维度:&quot;这个调用失败了怎么办&quot;</span></span>
<span class="line"><span>   - 看到外部调用问:有超时吗?</span></span>
<span class="line"><span>   - 看到 retry 问:有上限吗?</span></span>
<span class="line"><span>   - 看到没 fallback 问:挂了用户看到什么?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 关键路径加熔断 / 降级</span></span>
<span class="line"><span>   - 用 Sentinel / Hystrix / resilience4j</span></span>
<span class="line"><span>   - 配置:多少失败率触发熔断、熔断多久、半开多久</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 设计阶段做&quot;失败演练&quot;</span></span>
<span class="line"><span>   - 把每个外部依赖列出来</span></span>
<span class="line"><span>   - 问&quot;它挂了会怎样,我的系统能不能扛&quot;</span></span>
<span class="line"><span>   - 没思考清楚的别上线</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 定期混沌实验</span></span>
<span class="line"><span>   - 31 篇会展开</span></span>
<span class="line"><span>   - 主动注入失败,测系统反应</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 监控要看&quot;灰失败&quot;</span></span>
<span class="line"><span>   - 不只看整体 P99,还要按 user / region / endpoint 切片</span></span>
<span class="line"><span>   - 任何&quot;局部异常&quot;都该有告警</span></span></code></pre></div><hr><h2 id="四、真相-3-能自动化的别让人做-但盲目自动化会造新-toil" tabindex="-1">四、真相 3:能自动化的别让人做,但盲目自动化会造新 Toil <a class="header-anchor" href="#四、真相-3-能自动化的别让人做-但盲目自动化会造新-toil" aria-label="Permalink to &quot;四、真相 3:能自动化的别让人做,但盲目自动化会造新 Toil&quot;">​</a></h2><p>这是 4 个真相里<strong>最微妙的一个</strong>——前面三个真相都是&quot;必须接受&quot;,这一个是&quot;接受 + 警惕&quot;。</p><h3 id="_4-1-自动化的双刃" tabindex="-1">4.1 自动化的双刃 <a class="header-anchor" href="#_4-1-自动化的双刃" aria-label="Permalink to &quot;4.1 自动化的双刃&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>自动化的好处(显而易见):</span></span>
<span class="line"><span>   ✓ 减少 Toil(02 篇讲过)</span></span>
<span class="line"><span>   ✓ 减少人为错误(机器不会半夜手抖)</span></span>
<span class="line"><span>   ✓ 提高速度(几秒 vs 几十分钟)</span></span>
<span class="line"><span>   ✓ 一致性(每次执行一样)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>自动化的代价(常被忽视):</span></span>
<span class="line"><span>   ✗ 自动化代码本身需要维护(造了新工作)</span></span>
<span class="line"><span>   ✗ 自动化失败时人不知道怎么处理(肌肉记忆退化)</span></span>
<span class="line"><span>   ✗ 自动化掩盖根因(自动重启 OOM,没人查为什么 OOM)</span></span>
<span class="line"><span>   ✗ 自动化范围扩大风险(脚本 bug → 全网生效)</span></span></code></pre></div><h3 id="_4-2-一个真实-可虚构但-plausible-场景" tabindex="-1">4.2 一个真实(可虚构但 plausible)场景 <a class="header-anchor" href="#_4-2-一个真实-可虚构但-plausible-场景" aria-label="Permalink to &quot;4.2 一个真实(可虚构但 plausible)场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队 10 人,某服务有&quot;偶发 OOM&quot;问题</span></span>
<span class="line"><span>工程师写了一个自动化脚本:</span></span>
<span class="line"><span>   - 监控发现 pod OOM → 自动 kubectl delete pod</span></span>
<span class="line"><span>   - 让 K8s 自动重建 pod</span></span>
<span class="line"><span>   - 自愈,无需人介入</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第一周:每天 5-10 次 OOM,自动恢复,没人感知</span></span>
<span class="line"><span>第一个月:自愈记录 200 次,SRE 觉得&quot;完美&quot;</span></span>
<span class="line"><span>第三个月:OOM 频率从每天 5 次涨到 20 次</span></span>
<span class="line"><span>第六个月:某天自愈不灵了</span></span>
<span class="line"><span>   - pod 重建后立刻 OOM</span></span>
<span class="line"><span>   - 重建,立刻 OOM,陷入循环</span></span>
<span class="line"><span>   - 节点资源被吃光</span></span>
<span class="line"><span>   - 整个集群其他服务受影响</span></span>
<span class="line"><span></span></span>
<span class="line"><span>复盘根因:</span></span>
<span class="line"><span>   一个内存泄漏 bug 在 6 个月前就引入了</span></span>
<span class="line"><span>   自愈脚本完美掩盖了它</span></span>
<span class="line"><span>   现在泄漏速度终于超过&quot;重启清空&quot;的速度</span></span>
<span class="line"><span>   → 慢性病拖成绝症</span></span>
<span class="line"><span></span></span>
<span class="line"><span>教训:</span></span>
<span class="line"><span>   自动化&quot;治标&quot;了 6 个月</span></span>
<span class="line"><span>   没人&quot;治本&quot;,一直在恶化</span></span>
<span class="line"><span>   出事时,大家都忘了&quot;原来该查根因&quot;</span></span></code></pre></div><p><strong>这就是自动化的最大陷阱</strong>——它给你&quot;系统看起来很健康&quot;的假象,实际下面的腐烂在加速。</p><h3 id="_4-3-自动化的层次" tabindex="-1">4.3 自动化的层次 <a class="header-anchor" href="#_4-3-自动化的层次" aria-label="Permalink to &quot;4.3 自动化的层次&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>L0:全手工</span></span>
<span class="line"><span>   - 出事 → 工单 → 人来处理</span></span>
<span class="line"><span>   - Toil 最高,但事故根因被看见</span></span>
<span class="line"><span></span></span>
<span class="line"><span>L1:工具辅助</span></span>
<span class="line"><span>   - 出事 → 工单 → 人来,但有命令封装 / 脚本</span></span>
<span class="line"><span>   - 例:\`./quick-restart.sh service-A\`</span></span>
<span class="line"><span>   - 比手工快,但还是人触发</span></span>
<span class="line"><span></span></span>
<span class="line"><span>L2:外部触发的自动化</span></span>
<span class="line"><span>   - 写了脚本 / Playbook,人触发执行</span></span>
<span class="line"><span>   - 例:Runbook 执行链 / Ansible Playbook</span></span>
<span class="line"><span>   - 人决定&quot;什么时候 + 跑什么&quot;,机器执行</span></span>
<span class="line"><span></span></span>
<span class="line"><span>L3:自动检测 + 自动执行(自愈)</span></span>
<span class="line"><span>   - 监控发现问题 → 自动触发修复</span></span>
<span class="line"><span>   - 例:HPA 自动扩容、自动重启 OOM pod</span></span>
<span class="line"><span>   - 人不在循环里,系统自我恢复</span></span>
<span class="line"><span></span></span>
<span class="line"><span>L4:自适应(根据上下文决定动作)</span></span>
<span class="line"><span>   - 不只是&quot;挂了重启&quot;,还要&quot;判断该不该重启&quot;</span></span>
<span class="line"><span>   - 例:Site Reliability Engineering 里讲的 &quot;policy engine&quot;</span></span>
<span class="line"><span>   - 人定义策略,机器执行 + 学习</span></span></code></pre></div><p><strong>很多团队的自动化追到 L3 就停了</strong>——&quot;自动恢复&quot;看着很爽。<strong>但 L3 没有 L4 的&quot;判断力&quot;,非常容易出&quot;治标不治本&quot;的事</strong>。</p><h3 id="_4-4-自动化的-黄金平衡" tabindex="-1">4.4 自动化的&quot;黄金平衡&quot; <a class="header-anchor" href="#_4-4-自动化的-黄金平衡" aria-label="Permalink to &quot;4.4 自动化的&quot;黄金平衡&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>什么该自动化(适合 L2-L3):</span></span>
<span class="line"><span>   ✓ 重复且无脑的(扩容、重启、清磁盘)</span></span>
<span class="line"><span>   ✓ 高频但低风险的(每天发生 + 错了影响小)</span></span>
<span class="line"><span>   ✓ 有明确&quot;成功条件&quot;的(执行完能验证)</span></span>
<span class="line"><span>   ✓ 风险可控的(出错最多影响一个服务)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>什么不该自动化(留在 L1):</span></span>
<span class="line"><span>   ✗ 需要判断的(回滚 vs 修复 vs 等等)</span></span>
<span class="line"><span>   ✗ 低频但高风险的(数据迁移、配置变更)</span></span>
<span class="line"><span>   ✗ 后果不可逆的(删数据、停服务)</span></span>
<span class="line"><span>   ✗ 跨多个系统的复杂操作</span></span>
<span class="line"><span></span></span>
<span class="line"><span>什么必须警惕(不只是 L3,要 L4):</span></span>
<span class="line"><span>   △ &quot;自动恢复&quot;功能(必须同时记录&quot;本来要发生什么&quot;)</span></span>
<span class="line"><span>   △ &quot;自动扩容&quot;功能(必须有上限和告警)</span></span>
<span class="line"><span>   △ &quot;自动告警合并&quot;功能(必须有&quot;重要告警绕过&quot;机制)</span></span></code></pre></div><h3 id="_4-5-自愈系统必须配合的-治本-机制" tabindex="-1">4.5 自愈系统必须配合的&quot;治本&quot;机制 <a class="header-anchor" href="#_4-5-自愈系统必须配合的-治本-机制" aria-label="Permalink to &quot;4.5 自愈系统必须配合的&quot;治本&quot;机制&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>任何 L3 自愈,都必须配:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>1. 自愈次数告警</span></span>
<span class="line"><span>   - &quot;本周自愈触发 30 次&quot; → 报警</span></span>
<span class="line"><span>   - 表示&quot;自愈在变频繁&quot;,问题在恶化</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 自愈日志</span></span>
<span class="line"><span>   - 每次自愈记下&quot;上下文&quot;(为什么触发、做了什么、结果)</span></span>
<span class="line"><span>   - 复盘时能看见&quot;我们重启了多少次,问题没修&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 根因追踪 ticket</span></span>
<span class="line"><span>   - 自愈触发 N 次 → 自动开一个根因 ticket</span></span>
<span class="line"><span>   - 必须有人在 X 天内调查根因</span></span>
<span class="line"><span>   - 不允许&quot;无限自愈&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 自愈失败的兜底</span></span>
<span class="line"><span>   - 自愈失败 → 立刻触发人工告警</span></span>
<span class="line"><span>   - 不能&quot;自愈失败但没人知道&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 定期回顾&quot;哪些 L3 该升级 L1&quot;</span></span>
<span class="line"><span>   - 某个频繁触发的自愈,根因解决后该退回 L1</span></span>
<span class="line"><span>   - 自愈应该是&quot;过渡&quot;,不是&quot;永久&quot;</span></span></code></pre></div><h3 id="_4-6-接受真相-3-之后该做的事" tabindex="-1">4.6 接受真相 3 之后该做的事 <a class="header-anchor" href="#_4-6-接受真相-3-之后该做的事" aria-label="Permalink to &quot;4.6 接受真相 3 之后该做的事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 自动化前先评估 ROI</span></span>
<span class="line"><span>   - 自动化的开发时间 vs 节省的人时</span></span>
<span class="line"><span>   - 高频低耗时 Toil → 自动化(02 篇讲的优先级矩阵)</span></span>
<span class="line"><span>   - 低频高耗时 → 留 L1</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 自动化项目必须有&quot;维护人&quot;</span></span>
<span class="line"><span>   - 写脚本的工程师离职 → 谁接手</span></span>
<span class="line"><span>   - 没有 owner 的自动化就是&quot;定时炸弹&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 任何 L3 自愈必须配根因追踪</span></span>
<span class="line"><span>   - 单纯&quot;看着没事&quot;的自愈是慢性病掩饰</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 自动化要&quot;小步快跑&quot;,不要&quot;一次到位&quot;</span></span>
<span class="line"><span>   - 先 L1(人手动跑脚本)</span></span>
<span class="line"><span>   - 再 L2(人触发,机器跑)</span></span>
<span class="line"><span>   - 最后 L3(机器自己跑,人在 loop 外)</span></span>
<span class="line"><span>   - 跳过中间步骤 = 出 bug 不可挽回</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 教团队&quot;Runbook 文化&quot;</span></span>
<span class="line"><span>   - 29 篇会展开</span></span>
<span class="line"><span>   - Runbook 是&quot;自动化的下一步&quot;,不是&quot;自动化的替代&quot;</span></span></code></pre></div><hr><h2 id="五、真相-4-复盘-blameless-把-骂人-换成-修流程" tabindex="-1">五、真相 4:复盘 blameless,把&quot;骂人&quot;换成&quot;修流程&quot; <a class="header-anchor" href="#五、真相-4-复盘-blameless-把-骂人-换成-修流程" aria-label="Permalink to &quot;五、真相 4:复盘 blameless,把&quot;骂人&quot;换成&quot;修流程&quot;&quot;">​</a></h2><h3 id="_5-1-追责文化长什么样" tabindex="-1">5.1 追责文化长什么样 <a class="header-anchor" href="#_5-1-追责文化长什么样" aria-label="Permalink to &quot;5.1 追责文化长什么样&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>事故复盘场景(追责式):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>主持人:&quot;我们看一下昨晚的 P0,先听 XX 同学讲讲&quot;</span></span>
<span class="line"><span>XX:&quot;我合了一个 PR,改了一行配置,导致...&quot;</span></span>
<span class="line"><span>主持人:&quot;为什么没经过 review?&quot;</span></span>
<span class="line"><span>XX:&quot;review 了,但 reviewer 没注意到...&quot;</span></span>
<span class="line"><span>主持人:&quot;reviewer 是谁?&quot;</span></span>
<span class="line"><span>ZZ:&quot;我 review 的,我没看出来这个问题...&quot;</span></span>
<span class="line"><span>主持人:&quot;你们两个怎么都没注意?&quot;</span></span>
<span class="line"><span>(沉默 30 秒)</span></span>
<span class="line"><span>主持人:&quot;以后大家都要更仔细一点,这种事不能再发生&quot;</span></span>
<span class="line"><span>散会</span></span>
<span class="line"><span></span></span>
<span class="line"><span>会后:</span></span>
<span class="line"><span>- XX 心里默默说&quot;以后小事故我自己擦屁股,绝不报告&quot;</span></span>
<span class="line"><span>- ZZ 心里默默说&quot;以后 review 我点进去看就行,不深入&quot;</span></span>
<span class="line"><span>- 旁观工程师小李心里说&quot;幸亏不是我闯祸&quot;</span></span>
<span class="line"><span>- 大家学到了:&quot;出事 = 挨骂,不出事 = 沉默&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>6 周后:</span></span>
<span class="line"><span>- 类似的事故再次发生,只是闯祸的人换了</span></span>
<span class="line"><span>- 这次大家更&quot;小心&quot;地隐瞒了一些细节</span></span>
<span class="line"><span>- 复盘永远在表面打转</span></span></code></pre></div><p><strong>追责文化的真正代价不是&quot;骂了谁&quot;,是&quot;以后没人愿意主动报告问题&quot;</strong>。<strong>信息隐藏 = 改进停滞</strong>。</p><h3 id="_5-2-blameless-不是-不追责" tabindex="-1">5.2 Blameless 不是&quot;不追责&quot; <a class="header-anchor" href="#_5-2-blameless-不是-不追责" aria-label="Permalink to &quot;5.2 Blameless 不是&quot;不追责&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Blameless 是什么:</span></span>
<span class="line"><span>   ✓ 不追究&quot;个人&quot;的责任</span></span>
<span class="line"><span>   ✓ 追究&quot;流程&quot;的责任</span></span>
<span class="line"><span>   ✓ 信任&quot;出事的工程师在当时的处境下做了合理选择&quot;</span></span>
<span class="line"><span>   ✓ 假设&quot;问题暴露的是系统漏洞,不是个人能力&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Blameless 不是什么:</span></span>
<span class="line"><span>   ✗ 不追究任何责任</span></span>
<span class="line"><span>   ✗ &quot;大家辛苦了,散会&quot;</span></span>
<span class="line"><span>   ✗ &quot;都是误会,不用改进&quot;</span></span>
<span class="line"><span>   ✗ &quot;原谅一切&quot;</span></span></code></pre></div><p><strong>Blameless 是&quot;换个角度追责&quot;</strong>——不追个人,追流程;不问&quot;谁的错&quot;,问&quot;哪个环节漏了&quot;。</p><h3 id="_5-3-5-whys-法-停在流程层" tabindex="-1">5.3 5 Whys 法:停在流程层 <a class="header-anchor" href="#_5-3-5-whys-法-停在流程层" aria-label="Permalink to &quot;5.3 5 Whys 法:停在流程层&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某次事故:某工程师 destroy 了生产 RDS</span></span>
<span class="line"><span></span></span>
<span class="line"><span>错误的 5 Whys(往个人方向问):</span></span>
<span class="line"><span>   Why 1:为什么 RDS 被 destroy?</span></span>
<span class="line"><span>        ← 因为 XX 工程师跑了 terraform destroy</span></span>
<span class="line"><span>   Why 2:为什么他跑了 destroy?</span></span>
<span class="line"><span>        ← 因为他想清理某个 staging 环境,误操作了 prod</span></span>
<span class="line"><span>   Why 3:为什么会误操作?</span></span>
<span class="line"><span>        ← 因为他疲劳了</span></span>
<span class="line"><span>   Why 4:为什么他疲劳?</span></span>
<span class="line"><span>        ← 因为他加班</span></span>
<span class="line"><span>   Why 5:为什么他加班?</span></span>
<span class="line"><span>        ← 因为他不够专业</span></span>
<span class="line"><span>   结论:XX 工程师不够专业,扣绩效</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确的 5 Whys(往流程方向问):</span></span>
<span class="line"><span>   Why 1:为什么 RDS 被 destroy?</span></span>
<span class="line"><span>        ← terraform 命令成功执行了 destroy</span></span>
<span class="line"><span>   Why 2:为什么 destroy 命令成功了?</span></span>
<span class="line"><span>        ← 工程师有 prod 的 admin 权限</span></span>
<span class="line"><span>   Why 3:为什么工程师有 prod admin?</span></span>
<span class="line"><span>        ← 因为日常工作需要(配置变更等)</span></span>
<span class="line"><span>   Why 4:为什么&quot;日常配置变更&quot;需要 admin?</span></span>
<span class="line"><span>        ← 因为没有&quot;细粒度权限&quot;(只能读 + 改非破坏性资源)</span></span>
<span class="line"><span>   Why 5:为什么没有细粒度权限?</span></span>
<span class="line"><span>        ← IAM 策略设计时没考虑&quot;破坏性操作分级&quot;</span></span>
<span class="line"><span>   结论:</span></span>
<span class="line"><span>   - 改 IAM 策略,把 destroy 类操作单独审批</span></span>
<span class="line"><span>   - 改 Terraform 流程,destroy 必须 dry-run + 二次确认</span></span>
<span class="line"><span>   - 改 prod 操作流程,destructive 操作必须双人确认</span></span></code></pre></div><p><strong>两种 5 Whys 的最后一步差别</strong>:错误版本停在&quot;人&quot;(扣绩效);正确版本停在&quot;流程&quot;(改 IAM + 流程)。<strong>前者下次同样错还会发生(只是换个人),后者从根上修了</strong>。</p><h3 id="_5-4-blameless-文化的工程价值" tabindex="-1">5.4 Blameless 文化的工程价值 <a class="header-anchor" href="#_5-4-blameless-文化的工程价值" aria-label="Permalink to &quot;5.4 Blameless 文化的工程价值&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>有 Blameless 的团队:</span></span>
<span class="line"><span>   - 工程师主动报告小事故(&quot;我刚才差点出事&quot;)</span></span>
<span class="line"><span>   - 复盘文档详细到&quot;每一步的判断依据&quot;</span></span>
<span class="line"><span>   - 根因被反复深挖,修到流程层</span></span>
<span class="line"><span>   - 系统逐步加固,事故率下降</span></span>
<span class="line"><span></span></span>
<span class="line"><span>没 Blameless 的团队:</span></span>
<span class="line"><span>   - 小事故被隐瞒(报了挨骂)</span></span>
<span class="line"><span>   - 复盘只到表层(&quot;注意一点就行&quot;)</span></span>
<span class="line"><span>   - 根因永远是&quot;个人失误&quot;</span></span>
<span class="line"><span>   - 同样的事故反复发生</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这两条曲线 18 个月后:</span></span>
<span class="line"><span>   有 Blameless:事故率下降 60%+</span></span>
<span class="line"><span>   没 Blameless:事故率持平或上升</span></span></code></pre></div><h3 id="_5-5-一个真实-可虚构但-plausible-场景" tabindex="-1">5.5 一个真实(可虚构但 plausible)场景 <a class="header-anchor" href="#_5-5-一个真实-可虚构但-plausible-场景" aria-label="Permalink to &quot;5.5 一个真实(可虚构但 plausible)场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>版本 A:追责文化</span></span>
<span class="line"><span></span></span>
<span class="line"><span>事故:某次发布造成 P0,持续 90 分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第二天复盘:</span></span>
<span class="line"><span>   组长:&quot;是谁发的?&quot;</span></span>
<span class="line"><span>   小王(忐忑):&quot;是我...&quot;</span></span>
<span class="line"><span>   组长:&quot;PR review 谁批的?&quot;</span></span>
<span class="line"><span>   老李:&quot;是我...&quot;</span></span>
<span class="line"><span>   组长:&quot;你们两个都给我注意&quot;</span></span>
<span class="line"><span>   写在文档里:&quot;行动项:大家以后 review 更仔细&quot;</span></span>
<span class="line"><span>   散会</span></span>
<span class="line"><span></span></span>
<span class="line"><span>后续:</span></span>
<span class="line"><span>   3 个月后类似事故发生</span></span>
<span class="line"><span>   闯祸的工程师不敢承认 → 大家排查 1 小时找到是谁</span></span>
<span class="line"><span>   &quot;更仔细 review&quot; 没人能定义、没人能验证</span></span>
<span class="line"><span>   重复事故率不降反升</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>版本 B:Blameless 文化</span></span>
<span class="line"><span></span></span>
<span class="line"><span>同样事故:某次发布造成 P0,持续 90 分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第二天复盘:</span></span>
<span class="line"><span>   主持人:&quot;我们看一下昨晚的时间线,所有人按时间线讲发生了什么&quot;</span></span>
<span class="line"><span>   小王讲:&quot;我合并 PR 是基于 X 信息,当时认为没问题...&quot;</span></span>
<span class="line"><span>   老李讲:&quot;我 review 看的是 Y 部分,没看到 Z 部分会有影响...&quot;</span></span>
<span class="line"><span>   主持人:&quot;我们看看为什么 Z 部分没被 review 看出来&quot;</span></span>
<span class="line"><span>   讨论 30 分钟,挖出:</span></span>
<span class="line"><span>     - 自动化测试没覆盖 Z 部分</span></span>
<span class="line"><span>     - PR 模板里没要求&quot;是否影响 Z&quot;的勾选</span></span>
<span class="line"><span>     - 灰度发布配置没在这个 service 启用</span></span>
<span class="line"><span>   行动项:</span></span>
<span class="line"><span>     1. 给 Z 部分加测试(owner: 小王,deadline: 2 周)</span></span>
<span class="line"><span>     2. 改 PR 模板加 Z 影响勾选(owner: 老李,deadline: 1 周)</span></span>
<span class="line"><span>     3. 给这个 service 启灰度发布(owner: SRE,deadline: 1 个月)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>后续:</span></span>
<span class="line"><span>   3 个月后,3 个行动项都做完了</span></span>
<span class="line"><span>   类似事故发生时,灰度发布自动阻止了 90% 流量受影响</span></span>
<span class="line"><span>   实际 P0 持续 5 分钟而非 90 分钟</span></span>
<span class="line"><span>   团队学会了&quot;事故是改进的机会,不是惩罚的理由&quot;</span></span></code></pre></div><h3 id="_5-6-接受真相-4-之后该做的事" tabindex="-1">5.6 接受真相 4 之后该做的事 <a class="header-anchor" href="#_5-6-接受真相-4-之后该做的事" aria-label="Permalink to &quot;5.6 接受真相 4 之后该做的事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 复盘文档模板加上&quot;我们承诺无指责&quot;的开场</span></span>
<span class="line"><span>   - 字面写出来,不是默认</span></span>
<span class="line"><span>   - 33 篇会展开</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 5 Whys 训练</span></span>
<span class="line"><span>   - 每次 Why 问完,反思&quot;我们在追个人还是追流程&quot;</span></span>
<span class="line"><span>   - 必须停在&quot;流程 / 系统 / 工具&quot;层,不停在&quot;人&quot;层</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 行动项必须有 owner + deadline</span></span>
<span class="line"><span>   - &quot;大家以后注意&quot; = 没行动项</span></span>
<span class="line"><span>   - &quot;X 在 Y 之前做 Z&quot; = 真行动项</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 行动项的完成率要 review</span></span>
<span class="line"><span>   - 每月看上月行动项的完成情况</span></span>
<span class="line"><span>   - 没完成的要解释原因</span></span>
<span class="line"><span>   - 不允许&quot;开了复盘但没行动&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 小事故主动报告 → 给糖</span></span>
<span class="line"><span>   - 工程师主动说&quot;我刚才差点出事&quot; → 公开感谢</span></span>
<span class="line"><span>   - 这是 Blameless 文化的物质强化</span></span>
<span class="line"><span></span></span>
<span class="line"><span>6. 高管参加复盘,亲自示范不追个人</span></span>
<span class="line"><span>   - CTO 在场，主动避开&quot;是谁干的&quot;问题</span></span>
<span class="line"><span>   - 这是文化能否落地的关键</span></span></code></pre></div><hr><h2 id="六、四个真相的内在联系" tabindex="-1">六、四个真相的内在联系 <a class="header-anchor" href="#六、四个真相的内在联系" aria-label="Permalink to &quot;六、四个真相的内在联系&quot;">​</a></h2><p>这 4 个真相不是 4 件独立的事——<strong>它们是相互依赖的</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>真相 1(没有 100% 可用)</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   决定了&quot;必须有错误预算&quot;</span></span>
<span class="line"><span>   ↓ ↓</span></span>
<span class="line"><span>   ↓ 这个错误预算意味着&quot;允许一些失败&quot;</span></span>
<span class="line"><span>   ↓ ↓</span></span>
<span class="line"><span>真相 2(失败是常态)</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   决定了&quot;代码必须为失败设计&quot;</span></span>
<span class="line"><span>   ↓ ↓</span></span>
<span class="line"><span>   ↓ 应对失败的工具之一是&quot;自动恢复&quot;</span></span>
<span class="line"><span>   ↓ ↓</span></span>
<span class="line"><span>真相 3(自动化的双刃)</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   决定了&quot;自动化要克制,留根因 visibility&quot;</span></span>
<span class="line"><span>   ↓ ↓</span></span>
<span class="line"><span>   ↓ 但自动化失败时人要能介入</span></span>
<span class="line"><span>   ↓ ↓</span></span>
<span class="line"><span>   ↓ 介入后要复盘改进</span></span>
<span class="line"><span>   ↓ ↓</span></span>
<span class="line"><span>真相 4(Blameless 复盘)</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   决定了&quot;组织文化能否长期吸收改进&quot;</span></span>
<span class="line"><span>   ↓ ↓</span></span>
<span class="line"><span>   ↓ 改进会让真相 1 / 2 / 3 的现状逐步变好</span></span>
<span class="line"><span>   ↓ ↓</span></span>
<span class="line"><span>   ↓ → 系统更可靠 → 错误预算更宽松 → 创新空间更大</span></span>
<span class="line"><span>   ↑                                       │</span></span>
<span class="line"><span>   └───────────────────────────────────────┘</span></span>
<span class="line"><span>                  正反馈循环</span></span></code></pre></div><p><strong>这 4 件事任何一条做不到,其他三条都失效</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不接受真相 1</span></span>
<span class="line"><span>  → 销售喊 99.99%,工程师没法说&quot;不&quot;</span></span>
<span class="line"><span>  → SLO 设过高,错误预算永远超支</span></span>
<span class="line"><span>  → 内部紧张,大家被压力压垮</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不接受真相 2</span></span>
<span class="line"><span>  → 代码假设永不失败</span></span>
<span class="line"><span>  → 一旦失败就雪崩</span></span>
<span class="line"><span>  → 错误预算超支不是&quot;小事故&quot;,是&quot;大事故&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不接受真相 3</span></span>
<span class="line"><span>  → 盲目自动化掩盖根因</span></span>
<span class="line"><span>  → 慢性病拖成绝症</span></span>
<span class="line"><span>  → 一次性把错误预算耗光</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不接受真相 4</span></span>
<span class="line"><span>  → 复盘变扯皮,改进停滞</span></span>
<span class="line"><span>  → 同样的事故反复发生</span></span>
<span class="line"><span>  → 错误预算永远在烧,从不修</span></span></code></pre></div><p><strong>这 4 件事一起,构成 SRE 工程的&quot;心智地基&quot;</strong>——上面 30 篇技术内容,每一篇都建立在这 4 个真相之上。</p><hr><h2 id="七、把四个真相变成团队的-工程契约" tabindex="-1">七、把四个真相变成团队的&quot;工程契约&quot; <a class="header-anchor" href="#七、把四个真相变成团队的-工程契约" aria-label="Permalink to &quot;七、把四个真相变成团队的&quot;工程契约&quot;&quot;">​</a></h2><p>讲完概念,最后给一个<strong>团队级的工程契约模板</strong>——把这 4 个真相变成可签字、可遵守的文档:</p><div class="language-markdown vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">markdown</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 我们团队的 SRE 工程契约</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 契约 1:可用性的真相</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 我们不喊 100% 可用,任何对外的 SLA 必须工程师签字</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> SLO 是工程目标,SLA 是商务承诺,两者必须分开</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> SLO 至少高于 SLA 一档(SLO 99.9% 对应 SLA 99.5% 起)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 错误预算的算术每月公开,所有人都能查</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 错误预算超支触发&quot;阶梯响应&quot;,不是&quot;立即停发&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 契约 2:失败的真相</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 所有外部调用必须有超时(默认 5-10s)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 所有核心调用必须有熔断 / 降级</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 所有可重试操作必须幂等</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> PR review 必须问&quot;这个调用失败了怎么办&quot;</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 关键业务定期跑混沌实验(每季度至少 1 次)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 契约 3:自动化的真相</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 自动化前评估 ROI,不做 ROI 负的自动化</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 任何 L3 自愈必须配根因追踪 ticket</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 自动化代码必须有 owner,owner 离职前必须交接</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 频繁触发的自愈必须开根因调查,不允许&quot;永久自愈&quot;</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 自动化失败必须告警,不能&quot;挂了没人知道&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 契约 4:复盘的真相</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 所有 P0 / P1 必须开复盘,7 天内完成</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 复盘第一句:&quot;我们承诺无指责&quot;</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 5 Whys 必须停在&quot;流程 / 系统&quot;,不停在&quot;个人&quot;</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 行动项必须有 owner + deadline</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 月度 review 行动项完成率,不达标要解释</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 签字:</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> CTO: _______________ (兜底)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Tech Lead / SRE Lead: _______________</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 团队全体: _______________</span></span></code></pre></div><p><strong>这份契约不是文档,是承诺</strong>——每个新人入职必读 + 签字。<strong>任何把这份契约当摆设的团队,SRE 工程都做不起来</strong>。</p><hr><h2 id="八、踩坑提醒" tabindex="-1">八、踩坑提醒 <a class="header-anchor" href="#八、踩坑提醒" aria-label="Permalink to &quot;八、踩坑提醒&quot;">​</a></h2><ol><li><strong>承诺 100% 可用</strong>——空头支票,违约必赔</li><li><strong>SLA = SLO</strong>——出事就是合同纠纷</li><li><strong>代码假设依赖永不失败</strong>——分布式系统里就是 bug</li><li><strong>追求&quot;永不失败&quot;</strong>——物理不可达,要追&quot;挂得优雅&quot;</li><li><strong>慢失败不当事故</strong>——拖累上游,引发雪崩</li><li><strong>灰失败漏在监控外</strong>——按整体 P99 看不到,按 segment 才能发现</li><li><strong>盲目自动化</strong>——掩盖根因,慢性病拖成绝症</li><li><strong>L3 自愈无根因追踪</strong>——看着挺爽,实际在埋雷</li><li><strong>追责式复盘</strong>——下次没人主动报告</li><li><strong>5 Whys 停在个人</strong>——下次同样错只是换个人</li><li><strong>复盘没行动项</strong>——&quot;大家注意&quot;等于没改进</li><li><strong>行动项无 follow up</strong>——开了复盘但 ticket 烂尾</li><li><strong>4 个真相只挑 2 个做</strong>——4 件事相互依赖,缺一就崩</li></ol><hr><h2 id="九、本篇的硬指标" tabindex="-1">九、本篇的硬指标 <a class="header-anchor" href="#九、本篇的硬指标" aria-label="Permalink to &quot;九、本篇的硬指标&quot;">​</a></h2><p>看完这一篇,你应该能在白板前讲清楚:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ 99.9% / 99.99% / 99.999% 各对应一年多少分钟不可用</span></span>
<span class="line"><span>□ SLA 必须低于 SLO,为什么</span></span>
<span class="line"><span>□ 分布式系统里&quot;快失败 / 慢失败 / 灰失败&quot;的区别和危害</span></span>
<span class="line"><span>□ Design for Failure 的 8 条原则</span></span>
<span class="line"><span>□ 自动化的 4 个层次(L0-L4)和&quot;什么时候停在哪一级&quot;</span></span>
<span class="line"><span>□ 自愈系统的 5 个必备配套(告警 / 日志 / ticket / 兜底 / 退出机制)</span></span>
<span class="line"><span>□ Blameless 不是&quot;不追责&quot;,是&quot;换个角度追责&quot;</span></span>
<span class="line"><span>□ 5 Whys 怎么做,停在哪一层(流程,不是个人)</span></span>
<span class="line"><span>□ 4 个真相的内在联系(为什么任何一个不做都崩)</span></span></code></pre></div><p>并且能给自己团队<strong>做出 3 件具体动作</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 把团队当前服务的&quot;实际可用性&quot;算出来(看 Prometheus 历史)</span></span>
<span class="line"><span>   - 对比销售承诺的 SLA</span></span>
<span class="line"><span>   - 找差距 → 改 SLA 或改架构</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 给关键服务写一份&quot;失败模式清单&quot;</span></span>
<span class="line"><span>   - 列出所有外部依赖</span></span>
<span class="line"><span>   - 对每个依赖回答:&quot;挂了我会怎样&quot;</span></span>
<span class="line"><span>   - 没有答案的全部补上(超时 / 熔断 / 降级)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 给团队拟一份&quot;SRE 工程契约&quot;</span></span>
<span class="line"><span>   - 用上面的模板改一改</span></span>
<span class="line"><span>   - 让 CTO + Tech Lead + 全员签字</span></span>
<span class="line"><span>   - 这是文化能落地的基础</span></span></code></pre></div><p><strong>做完这 3 件事,你团队的 SRE 工程就有了&quot;心智地基&quot;——剩下的 30 篇技术内容才有意义</strong>。</p><hr><h2 id="十、第一层结束语" tabindex="-1">十、第一层结束语 <a class="header-anchor" href="#十、第一层结束语" aria-label="Permalink to &quot;十、第一层结束语&quot;">​</a></h2><p>这是第一层(心智)的最后一篇,<strong>写到这里你应该已经具备 SRE 工程师的基础心智</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你应该开始用 SRE 的眼睛看世界:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  看到一个新服务上线 → 问 SLO 是什么</span></span>
<span class="line"><span>  看到一段代码 → 问&quot;失败了怎么办&quot;</span></span>
<span class="line"><span>  看到一份发布计划 → 问&quot;灰度怎么发&quot;</span></span>
<span class="line"><span>  看到一次告警 → 问&quot;Runbook 在哪&quot;</span></span>
<span class="line"><span>  看到一份复盘 → 问&quot;行动项 follow up 了吗&quot;</span></span>
<span class="line"><span>  看到一份 KPI → 问&quot;MTTR / Change Failure Rate 是多少&quot;</span></span>
<span class="line"><span>  看到一份 SLA → 问&quot;SLO 是多少,缓冲够吗&quot;</span></span>
<span class="line"><span>  看到一份招聘 JD → 问&quot;这个 SRE 是真 SRE 还是高级运维&quot;</span></span></code></pre></div><p><strong>这种&quot;反射&quot;就是 SRE 工程师和&quot;普通开发&quot;的差别</strong>——技术能力可以学,但<strong>这套反射只能通过&quot;反复地用这套眼睛看世界&quot;才能内化</strong>。</p><p>接下来 30 篇,<strong>每一篇都是这套反射的一个具体支撑</strong>:</p><ul><li>第二层(05-12):<strong>Metrics / Logs / Traces / Profile</strong> —— 让你的&quot;看见&quot;变得真实</li><li>第三层(13-17):<strong>SLI / SLO / 告警 / 仪表盘 / 错误预算政治</strong> —— 让你的&quot;衡量&quot;变得严格</li><li>第四层(18-23):<strong>CI/CD / GitOps / 渐进发布</strong> —— 让你的&quot;变更&quot;变得安全</li><li>第五层(24-27):<strong>IaC / Terraform / 配置管理</strong> —— 让你的&quot;基础设施&quot;变得可控</li><li>第六层(28-34):<strong>On-call / Runbook / 混沌 / 容量 / 事故 / 复盘 / FinOps</strong> —— 让你的&quot;运维&quot;变得专业</li></ul><p><strong>这 30 篇会越来越具体,越来越落地</strong>。但记住:<strong>所有这些技术内容,本质都是这 4 个真相的工程化实现</strong>。技术细节会变(工具会换),但 4 个真相不会变。<strong>任何时候你迷茫了,回到这 4 个真相重新思考——这就是 SRE 工程的北极星</strong>。</p><hr><p>下一篇:<strong><code>05-Metrics心智.md</code></strong>——进入第二层&quot;可观测性&quot;。<strong>Metric 是可观测性的地基,这一篇讲 Metric 的核心心智</strong>:<strong>Counter / Gauge / Histogram 三种基本类型为什么是这三种,为什么不要直接存 avg 而要存 histogram,Cumulative 和 Delta 哪个更适合 Prometheus</strong>,以及一个非常常见的反面教材:<strong>某团队为了&quot;省存储&quot;把所有 metric 都存成 avg,结果半年后所有 P99 / SLO 都重做</strong>。Metrics 是 90% 团队上 SRE 时第一个上的能力,<strong>也是第一个用错的</strong>——这一篇把这些坑提前讲清楚,后面 7 篇可观测性内容就有了地基。</p>`,109)])])}const d=n(e,[["render",i]]);export{q as __pageData,d as default};
