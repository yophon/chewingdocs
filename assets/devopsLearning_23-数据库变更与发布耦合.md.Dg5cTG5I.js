import{_ as a,H as n,f as i,i as p}from"./chunks/framework.BHvCMIhP.js";const o=JSON.parse('{"title":"数据库变更与发布耦合:在线 DDL / Expand-Contract / gh-ost / 蓝绿 schema","description":"","frontmatter":{},"headers":[],"relativePath":"devopsLearning/23-数据库变更与发布耦合.md","filePath":"devopsLearning/23-数据库变更与发布耦合.md","lastUpdated":1778496697000}'),l={name:"devopsLearning/23-数据库变更与发布耦合.md"};function e(t,s,h,k,r,d){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="数据库变更与发布耦合-在线-ddl-expand-contract-gh-ost-蓝绿-schema" tabindex="-1">数据库变更与发布耦合:在线 DDL / Expand-Contract / gh-ost / 蓝绿 schema <a class="header-anchor" href="#数据库变更与发布耦合-在线-ddl-expand-contract-gh-ost-蓝绿-schema" aria-label="Permalink to &quot;数据库变更与发布耦合:在线 DDL / Expand-Contract / gh-ost / 蓝绿 schema&quot;">​</a></h1><p>发布工程这一层(18-23)讲了制品仓库、GitOps、渐进发布、Feature Flag——这些都解决了&quot;代码的发布&quot;。但<strong>真正的发布事故,有一半根因不在代码,在数据库 schema 变更</strong>。这一篇就是来啃这块硬骨头的。</p><p>代码出 bug 你可以 rollback——10 秒钟的事。<strong>但你 ALTER 了表加了一列、写了新数据进去,要 rollback 到 ALTER 之前的状态,数据回不去</strong>。这是一道认知分界线:<strong>代码是无状态的,数据有状态;无状态的东西可以来回切,有状态的东西不能</strong>。前面 22 篇里 K8s、ArgoCD、金丝雀、Feature Flag 教给你的全部直觉,<strong>在这一篇面前都要重新审视</strong>——因为它们都建立在&quot;我能回到上一个版本&quot;的前提上,而 schema 变更<strong>根本没有&quot;回到上一个版本&quot;这个选项</strong>。</p><p>这一篇要讲清楚三件事:<strong>为什么 schema 变更是发布工程的最大风险</strong>、<strong>如何用在线 DDL 工具(gh-ost / pt-osc / PG concurrently)避开锁表</strong>、<strong>如何用 Expand-Contract 模式让代码 / schema / 数据三件事永远兼容</strong>。讲透了 Expand-Contract,你团队下半年的 P0 事故能少掉 1/3。</p><blockquote><p>一句话先记住:<strong>所有&quot;我先把代码部署上去,改 schema 之后就好了&quot;的想法,都是事故制造机</strong>——这等同于&quot;我先开车把油门踩到底,加油的事先放放&quot;。发布事故的真正破坏力来自<strong>新老代码与新老 schema 任意组合都必须能跑</strong>这个组合爆炸;Expand-Contract 不是某个高级技巧,<strong>它是这一层唯一能扛过组合爆炸的工程套路</strong>。</p></blockquote><hr><h2 id="一、问题场景-为什么-schema-变更是发布最大的雷" tabindex="-1">一、问题场景:为什么 schema 变更是发布最大的雷 <a class="header-anchor" href="#一、问题场景-为什么-schema-变更是发布最大的雷" aria-label="Permalink to &quot;一、问题场景:为什么 schema 变更是发布最大的雷&quot;">​</a></h2><h3 id="_1-1-死法一-ddl-把生产打到不可用" tabindex="-1">1.1 死法一:DDL 把生产打到不可用 <a class="header-anchor" href="#_1-1-死法一-ddl-把生产打到不可用" aria-label="Permalink to &quot;1.1 死法一:DDL 把生产打到不可用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>凌晨 02:00,DBA 跑一句&quot;无伤大雅&quot;的迁移:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>ALTER TABLE orders ADD COLUMN refund_status VARCHAR(20) DEFAULT &#39;none&#39;;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>orders 表 8 亿行,InnoDB 默认 ALTER 行为:</span></span>
<span class="line"><span>  - 创建新的临时表(copy 模式)</span></span>
<span class="line"><span>  - 把 8 亿行数据一行行 copy 过去(几个小时)</span></span>
<span class="line"><span>  - 期间 metadata lock 阻塞所有 DML</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>02:01  应用所有写 orders 的请求开始等锁</span></span>
<span class="line"><span>02:02  连接池耗尽,5xx 飙到 90%</span></span>
<span class="line"><span>02:03  紧急 KILL 这个 ALTER</span></span>
<span class="line"><span>       但 InnoDB 还在 undo 已经 copy 的数据,这个过程也要 1 小时</span></span>
<span class="line"><span>02:30  好不容易 KILL 完,应用恢复</span></span>
<span class="line"><span>       中间 30 分钟 24,000 笔订单失败</span></span></code></pre></div><p><strong>根因</strong>:<strong>MySQL 默认 ALTER 在大表上等于&quot;全表锁 + 数据迁移&quot;</strong>。DBA 在小测试环境跑 ALTER 用了 0.5 秒,迁到生产 8 亿行就是 3 小时,期间业务<strong>完全不可用</strong>。<strong>这件事 5.6 之前是 MySQL 的常态</strong>,5.7 加了 online DDL 之后改善但<strong>远没有解决——某些 DDL 仍然是阻塞的</strong>。</p><h3 id="_1-2-死法二-新老代码并存撞-schema" tabindex="-1">1.2 死法二:新老代码并存撞 schema <a class="header-anchor" href="#_1-2-死法二-新老代码并存撞-schema" aria-label="Permalink to &quot;1.2 死法二:新老代码并存撞 schema&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T-0  发布 v2 代码 + ALTER TABLE users ADD COLUMN nickname VARCHAR(100);</span></span>
<span class="line"><span>     部署顺序:先发 schema,再滚动更新代码</span></span>
<span class="line"><span>     </span></span>
<span class="line"><span>T+0   ALTER 完成</span></span>
<span class="line"><span>T+1   v2 代码开始滚动部署,30 个 pod 一个一个换</span></span>
<span class="line"><span>T+1~10  新老代码并存:</span></span>
<span class="line"><span>        - 老 v1 pod 收到注册请求,执行 INSERT INTO users (name, email) VALUES (...)</span></span>
<span class="line"><span>          因为 v1 不知道 nickname 列,这里如果 nickname NOT NULL 没默认值 → INSERT 失败</span></span>
<span class="line"><span>        - 即使有 DEFAULT,某些 ORM(尤其用 SELECT *)会缓存 schema</span></span>
<span class="line"><span>          → v1 拿到 4 列的行但 ORM 期望 3 列 → 反序列化失败 → 5xx</span></span>
<span class="line"><span>T+10  全部换成 v2,问题消失</span></span>
<span class="line"><span>       但中间 10 分钟有 2000 笔注册失败</span></span></code></pre></div><p><strong>根因</strong>:<strong>&quot;先 schema 再代码&quot;的部署顺序假设了&quot;老代码兼容新 schema&quot;</strong>——这个假设极脆弱,只要 schema 改动稍微激进一点,老代码就处理不了。新老代码并存 10 分钟,<strong>任何一个不兼容点都是事故</strong>。</p><h3 id="_1-3-死法三-rollback-被-schema-挡住" tabindex="-1">1.3 死法三:rollback 被 schema 挡住 <a class="header-anchor" href="#_1-3-死法三-rollback-被-schema-挡住" aria-label="Permalink to &quot;1.3 死法三:rollback 被 schema 挡住&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>21:00  发布 v3,包含一个 schema 变更:</span></span>
<span class="line"><span>       ALTER TABLE orders DROP COLUMN legacy_status;</span></span>
<span class="line"><span>       同时新代码不再读写这列</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>21:30  发现 v3 一个核心 bug,影响 10% 订单</span></span>
<span class="line"><span>21:31  决定 rollback 到 v2</span></span>
<span class="line"><span>21:32  v2 代码上线</span></span>
<span class="line"><span>       v2 代码依赖 legacy_status 列 → 全员 5xx</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>21:33  发现 schema 已经把列删了,回不去</span></span>
<span class="line"><span>       即使再 ADD COLUMN 回来,数据已经丢了</span></span>
<span class="line"><span>21:50  最终决定:fix forward,在 v3 上紧急打补丁</span></span>
<span class="line"><span>00:30  补丁上线,事故 3.5 小时</span></span></code></pre></div><p><strong>根因</strong>:<strong>DROP COLUMN 是单向操作,数据丢了 ALTER 回去也只能恢复 schema,数据回不来</strong>。Rollback 路径被&quot;已经删除的数据&quot;挡死,<strong>只能 fix forward</strong>——而 fix forward 在凌晨写代码的速度远慢于 rollback。</p><h3 id="_1-4-三种死法的共同点" tabindex="-1">1.4 三种死法的共同点 <a class="header-anchor" href="#_1-4-三种死法的共同点" aria-label="Permalink to &quot;1.4 三种死法的共同点&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>死法一:DDL 锁表           → 数据有状态,改 schema 不是无代价的</span></span>
<span class="line"><span>死法二:新老代码并存撞 schema → 没有&quot;兼容期&quot;,并存就崩</span></span>
<span class="line"><span>死法三:rollback 被挡          → 数据是单向流,删了就没了</span></span></code></pre></div><p><strong>这三件事的共同根因都是:数据库 schema 有状态,而所有&quot;无状态&quot;的发布技巧都对它失灵</strong>。</p><hr><h2 id="二、为什么-蓝绿-schema-不存在" tabindex="-1">二、为什么&quot;蓝绿 schema&quot;不存在 <a class="header-anchor" href="#二、为什么-蓝绿-schema-不存在" aria-label="Permalink to &quot;二、为什么&quot;蓝绿 schema&quot;不存在&quot;">​</a></h2><p>21 篇讲了蓝绿发布——起一份 Green 环境,流量切过去,Blue 销毁。<strong>很多团队的第一反应是:那 schema 也来个&quot;蓝绿&quot;不就行了</strong>?</p><h3 id="_2-1-想象中的蓝绿-schema" tabindex="-1">2.1 想象中的蓝绿 schema <a class="header-anchor" href="#_2-1-想象中的蓝绿-schema" aria-label="Permalink to &quot;2.1 想象中的蓝绿 schema&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>理想图(不存在):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ┌─────────────┐         ┌─────────────┐</span></span>
<span class="line"><span>  │  Blue 应用   │ ──────→ │  Blue DB    │</span></span>
<span class="line"><span>  │   v1        │         │  schema v1  │</span></span>
<span class="line"><span>  └─────────────┘         └─────────────┘</span></span>
<span class="line"><span>                                ║</span></span>
<span class="line"><span>                                ║ 实时复制 + schema transform</span></span>
<span class="line"><span>                                ▼</span></span>
<span class="line"><span>  ┌─────────────┐         ┌─────────────┐</span></span>
<span class="line"><span>  │  Green 应用 │ ──────→ │  Green DB   │</span></span>
<span class="line"><span>  │   v2        │         │  schema v2  │</span></span>
<span class="line"><span>  └─────────────┘         └─────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  想法:切流量 = 同时切 DB</span></span>
<span class="line"><span>  实际:数据从切流量那一刻起开始&quot;分叉&quot;,</span></span>
<span class="line"><span>        Blue 写新订单,Green 也写新订单</span></span>
<span class="line"><span>        两边数据无法合并,流量切回 Blue 时 Green 写入的数据丢失</span></span></code></pre></div><h3 id="_2-2-为什么不存在" tabindex="-1">2.2 为什么不存在 <a class="header-anchor" href="#_2-2-为什么不存在" aria-label="Permalink to &quot;2.2 为什么不存在&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>代码:                数据:</span></span>
<span class="line"><span>  无状态                有状态</span></span>
<span class="line"><span>  v1 和 v2 是平行的     新写的数据是单向流</span></span>
<span class="line"><span>  可以 A/B/A 切来切去   一旦写入就不能&quot;切回去&quot;</span></span>
<span class="line"><span>                       Blue 不知道 Green 写了什么</span></span>
<span class="line"><span>                       Green 不知道 Blue 写了什么</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 切回去 = 数据丢失</span></span>
<span class="line"><span>→ 双写 = 数据冲突(主键 / 唯一约束)</span></span>
<span class="line"><span>→ 流量切回任一边都意味着另一边的写入&quot;失效&quot;</span></span></code></pre></div><p><strong>这是物理学问题,不是工程学问题</strong>——除非你让数据库&quot;无状态化&quot;(读多写少的字典表 / 静态配置表),否则 schema 不能蓝绿。</p><h3 id="_2-3-唯一例外-读多写少的字典表" tabindex="-1">2.3 唯一例外:读多写少的字典表 <a class="header-anchor" href="#_2-3-唯一例外-读多写少的字典表" aria-label="Permalink to &quot;2.3 唯一例外:读多写少的字典表&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;字典表&quot;是只读或者极少写的表:</span></span>
<span class="line"><span>  - 国家 / 货币代码</span></span>
<span class="line"><span>  - 产品分类</span></span>
<span class="line"><span>  - 系统配置</span></span>
<span class="line"><span>  - feature flag(尽管你不应该用 DB 存 flag,见 22 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这种表确实可以&quot;蓝绿&quot;:</span></span>
<span class="line"><span>  - 准备新版字典表(独立 schema / 独立表名)</span></span>
<span class="line"><span>  - 应用切到读新版</span></span>
<span class="line"><span>  - 旧版保留 1 周后销毁</span></span>
<span class="line"><span></span></span>
<span class="line"><span>但严格来说这不是&quot;蓝绿 schema&quot;,</span></span>
<span class="line"><span>是&quot;蓝绿数据副本&quot;——前提是数据不可变(immutable)</span></span></code></pre></div><p><strong>这一节的结论</strong>:<strong>业务表上不存在蓝绿 schema</strong>。所有&quot;我要做 schema 蓝绿&quot;的方案,最终都会演变成下面要讲的 <strong>Expand-Contract</strong>——把&quot;切换&quot;拆成多次&quot;兼容期 + 渐进迁移&quot;。</p><hr><h2 id="三、在线-ddl-让-alter-不再锁表" tabindex="-1">三、在线 DDL:让 ALTER 不再锁表 <a class="header-anchor" href="#三、在线-ddl-让-alter-不再锁表" aria-label="Permalink to &quot;三、在线 DDL:让 ALTER 不再锁表&quot;">​</a></h2><p>讲 Expand-Contract 之前,先解决&quot;执行单个 DDL 怎么不锁表&quot;——这是 Expand-Contract 每一步都要用到的基础工具。</p><h3 id="_3-1-mysql-的-algorithm-instant-8-0" tabindex="-1">3.1 MySQL 的 ALGORITHM=INSTANT(8.0+) <a class="header-anchor" href="#_3-1-mysql-的-algorithm-instant-8-0" aria-label="Permalink to &quot;3.1 MySQL 的 ALGORITHM=INSTANT(8.0+)&quot;">​</a></h3><p>MySQL 8.0 引入了真正的&quot;瞬时 DDL&quot;——某些 DDL <strong>不动数据,只改 metadata</strong>,1 秒内完成。</p><div class="language-sql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">sql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 8.0+ 支持的 INSTANT DDL(部分)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALTER</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> TABLE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ADD</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> COLUMN refund_at </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">TIMESTAMP</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> NULL</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALGORITHM=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">INSTANT;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALTER</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> TABLE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">DROP</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> COLUMN refund_at, </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALGORITHM=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">INSTANT;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 8.0.29+ 支持</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALTER</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> TABLE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders RENAME COLUMN foo </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">TO</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> bar, </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALGORITHM=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">INSTANT;</span></span></code></pre></div><p><strong>INSTANT 能干什么</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ ADD COLUMN(默认放在最后,且如果有默认值)</span></span>
<span class="line"><span>✓ DROP COLUMN(8.0.29+)</span></span>
<span class="line"><span>✓ RENAME COLUMN</span></span>
<span class="line"><span>✓ 修改 ENUM/SET 在最末追加成员</span></span>
<span class="line"><span>✓ 修改列默认值</span></span>
<span class="line"><span>✓ 设置或删除虚拟列的索引</span></span></code></pre></div><p><strong>INSTANT 不能干什么</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 加索引(必须 INPLACE + concurrent DML)</span></span>
<span class="line"><span>✗ 修改列类型(只能 COPY)</span></span>
<span class="line"><span>✗ 加 NOT NULL 约束(可能 COPY,得看默认值)</span></span>
<span class="line"><span>✗ ADD COLUMN AFTER xxx(改了列顺序就不能 INSTANT)</span></span>
<span class="line"><span>✗ 加外键</span></span>
<span class="line"><span>✗ 改字符集 / 排序规则</span></span></code></pre></div><p><strong>一个简单的判断方法</strong>:<strong>只动 metadata,不动数据 = INSTANT</strong>;<strong>要扫所有行 / 锁所有行 = 不能 INSTANT</strong>。</p><h3 id="_3-2-pt-online-schema-change-pt-osc" tabindex="-1">3.2 pt-online-schema-change(pt-osc) <a class="header-anchor" href="#_3-2-pt-online-schema-change-pt-osc" aria-label="Permalink to &quot;3.2 pt-online-schema-change(pt-osc)&quot;">​</a></h3><p>MySQL 8.0 之前(或者 INSTANT 不支持的 DDL),靠 Percona Toolkit 的 <code>pt-online-schema-change</code>(pt-osc)。原理:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>pt-osc 工作流:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  1. 创建影子表(_orders_new),schema 是目标新 schema</span></span>
<span class="line"><span>     ALTER TABLE _orders_new ADD COLUMN refund_status VARCHAR(20);</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  2. 给原表加三个触发器:</span></span>
<span class="line"><span>     - INSERT trigger: 原表 INSERT 也写 _orders_new</span></span>
<span class="line"><span>     - UPDATE trigger: 原表 UPDATE 也更新 _orders_new</span></span>
<span class="line"><span>     - DELETE trigger: 原表 DELETE 也从 _orders_new 删</span></span>
<span class="line"><span>     </span></span>
<span class="line"><span>  3. 后台分批 copy 数据:</span></span>
<span class="line"><span>     INSERT IGNORE INTO _orders_new SELECT * FROM orders</span></span>
<span class="line"><span>       WHERE id BETWEEN x AND x+chunk;</span></span>
<span class="line"><span>     每 chunk 1000 行,中间 sleep 避开峰值</span></span>
<span class="line"><span>     </span></span>
<span class="line"><span>  4. copy 完成后,原子 RENAME:</span></span>
<span class="line"><span>     RENAME TABLE orders TO _orders_old, _orders_new TO orders;</span></span>
<span class="line"><span>     </span></span>
<span class="line"><span>  5. drop _orders_old</span></span></code></pre></div><p><strong>优点</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 工作时不锁表(只在 RENAME 那一瞬间几毫秒)</span></span>
<span class="line"><span>✓ 应用代码完全感知不到</span></span>
<span class="line"><span>✓ 支持暂停 / 恢复</span></span>
<span class="line"><span>✓ 监控复制延迟,延迟高自动减速</span></span></code></pre></div><p><strong>缺点</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 三个触发器对写性能有 10-30% 影响(每个写操作多跑触发器)</span></span>
<span class="line"><span>✗ 中间空间占用 2x(影子表 + 原表)</span></span>
<span class="line"><span>✗ 长事务会阻塞 RENAME → 失败重试</span></span>
<span class="line"><span>✗ 外键支持有坑(必须用 --alter-foreign-keys-method)</span></span></code></pre></div><h3 id="_3-3-gh-ost-github-online-schema-change" tabindex="-1">3.3 gh-ost(GitHub Online Schema Change) <a class="header-anchor" href="#_3-3-gh-ost-github-online-schema-change" aria-label="Permalink to &quot;3.3 gh-ost(GitHub Online Schema Change)&quot;">​</a></h3><p>GitHub 因为 pt-osc 的触发器问题(写性能损耗 + 主从延迟),开发了 <code>gh-ost</code>。<strong>核心差异:不用触发器,改读 binlog</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>gh-ost 工作流:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌─────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                                                             │</span></span>
<span class="line"><span>│   ┌──────────────┐  应用写  ┌──────────────────┐             │</span></span>
<span class="line"><span>│   │  应用层       │ ───────▶│   原表 orders     │             │</span></span>
<span class="line"><span>│   └──────────────┘          └────────┬─────────┘             │</span></span>
<span class="line"><span>│                                      │ 写入 binlog            │</span></span>
<span class="line"><span>│                                      ▼                       │</span></span>
<span class="line"><span>│                              ┌──────────────────┐             │</span></span>
<span class="line"><span>│                              │   MySQL binlog   │             │</span></span>
<span class="line"><span>│                              └─────┬────────────┘             │</span></span>
<span class="line"><span>│                                    │ gh-ost 订阅                │</span></span>
<span class="line"><span>│                                    ▼                          │</span></span>
<span class="line"><span>│                              ┌──────────────────┐             │</span></span>
<span class="line"><span>│                              │   gh-ost worker  │             │</span></span>
<span class="line"><span>│                              │                  │             │</span></span>
<span class="line"><span>│                              │ 1. 创建影子表     │             │</span></span>
<span class="line"><span>│                              │ 2. 后台分批 copy │             │</span></span>
<span class="line"><span>│                              │ 3. 应用 binlog 增量│            │</span></span>
<span class="line"><span>│                              │    到影子表        │            │</span></span>
<span class="line"><span>│                              │ 4. cut-over       │            │</span></span>
<span class="line"><span>│                              └─────┬────────────┘             │</span></span>
<span class="line"><span>│                                    │                          │</span></span>
<span class="line"><span>│                                    ▼                          │</span></span>
<span class="line"><span>│                              ┌──────────────────┐             │</span></span>
<span class="line"><span>│                              │  影子表 _orders_  │             │</span></span>
<span class="line"><span>│                              │   ghost_         │             │</span></span>
<span class="line"><span>│                              └──────────────────┘             │</span></span>
<span class="line"><span>│                                                             │</span></span>
<span class="line"><span>│   cut-over 阶段(几毫秒):                                    │</span></span>
<span class="line"><span>│     RENAME TABLE orders TO _orders_del,                      │</span></span>
<span class="line"><span>│                  _orders_ghost_ TO orders;                  │</span></span>
<span class="line"><span>│                                                             │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>关键能力</strong>(都是 pt-osc 没有或薄弱的):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 无触发器 → 写性能几乎不受影响</span></span>
<span class="line"><span>✓ 可暂停 → 高峰期暂停,低峰期继续</span></span>
<span class="line"><span>✓ 动态限流 → 根据主从延迟自动调速</span></span>
<span class="line"><span>✓ throttling 配置丰富 → 可以基于多个指标限流</span></span>
<span class="line"><span>✓ 命中迁移测试 → 可以在从库先跑一遍验证</span></span>
<span class="line"><span>✓ 交互式控制 → 通过 socket 文件实时改参数</span></span></code></pre></div><p><strong>一个真实的 gh-ost 命令行</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">gh-ost</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --host=mysql-master.prod</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --user=ghost</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --password=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$GH_OST_PASSWORD</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --database=shop</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --table=orders</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --alter=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;ADD COLUMN refund_status VARCHAR(20) DEFAULT &#39;none&#39;&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --chunk-size=1000</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --max-load=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;Threads_running=50&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --critical-load=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;Threads_running=200&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --max-lag-millis=2000</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --throttle-control-replicas=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;replica-1.prod,replica-2.prod&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --serve-socket-file=/tmp/gh-ost.sock</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --switch-to-rbr</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --allow-on-master</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --execute</span></span></code></pre></div><p><strong>关键参数取舍</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>--chunk-size=1000           每批 1000 行</span></span>
<span class="line"><span>                            太小:吞吐量低,gh-ost 运行时间长</span></span>
<span class="line"><span>                            太大:每批锁开销大,影响延迟</span></span>
<span class="line"><span>                            8 亿行的表,1000 / chunk 大约要 8-12 小时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>--max-load                  当主库 Threads_running &gt; 50 时自动减速</span></span>
<span class="line"><span>                            生产建议设到&quot;业务正常上限的 1.2x&quot;</span></span>
<span class="line"><span>                            </span></span>
<span class="line"><span>--critical-load             当主库 Threads_running &gt; 200 时立刻退出</span></span>
<span class="line"><span>                            防止 gh-ost 自己把生产打挂</span></span>
<span class="line"><span></span></span>
<span class="line"><span>--max-lag-millis            从库延迟超 2 秒自动减速</span></span>
<span class="line"><span>                            对从库读敏感的业务,这个数要更小</span></span>
<span class="line"><span></span></span>
<span class="line"><span>--throttle-control-replicas 列出所有重要从库,任一延迟高就限速</span></span>
<span class="line"><span>                            不写 = gh-ost 不知道从库,可能把从库打挂</span></span></code></pre></div><p><strong>经验</strong>:<strong>生产 gh-ost 必须先在 staging 跑过完整流程,且必须把 throttle 设保守</strong>。不限流的 gh-ost 等同于直接 ALTER。</p><h3 id="_3-4-pt-osc-vs-gh-ost-选型" tabindex="-1">3.4 pt-osc vs gh-ost 选型 <a class="header-anchor" href="#_3-4-pt-osc-vs-gh-ost-选型" aria-label="Permalink to &quot;3.4 pt-osc vs gh-ost 选型&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>gh-ost 是 pt-osc 的进化版,大部分场景应该用 gh-ost。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>选 pt-osc 的剩余场景:</span></span>
<span class="line"><span>  - MySQL 没开 binlog ROW 模式</span></span>
<span class="line"><span>  - 用的是不支持 binlog 订阅的存储(早期 RDS / 老版本)</span></span>
<span class="line"><span>  - 团队已经在用 pt-osc 且对 gh-ost 不熟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>选 gh-ost 的场景:</span></span>
<span class="line"><span>  - 写密集场景(避免触发器损耗)</span></span>
<span class="line"><span>  - 需要主从一致性(从库延迟敏感)</span></span>
<span class="line"><span>  - 想暂停 / 调速(gh-ost 的 socket 控制是杀手锏)</span></span></code></pre></div><h3 id="_3-5-postgresql-的玩法" tabindex="-1">3.5 PostgreSQL 的玩法 <a class="header-anchor" href="#_3-5-postgresql-的玩法" aria-label="Permalink to &quot;3.5 PostgreSQL 的玩法&quot;">​</a></h3><p>PostgreSQL 的并发 DDL 模型和 MySQL 不同——更细粒度的锁、更激进的并发。</p><div class="language-sql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">sql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 加索引:必须 CONCURRENTLY,否则锁表</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">CREATE</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> INDEX</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> CONCURRENTLY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> idx_orders_user_id </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ON</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders(user_id);</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 加 NOT NULL 列(分步):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- ✗ 错误:一步加 NOT NULL,锁表</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALTER</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> TABLE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ADD</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> COLUMN </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">status</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> VARCHAR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">20</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">NOT NULL</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> DEFAULT</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;pending&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- ✓ 正确:分步</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- Step 1: 加 NULL-able 列,带默认值(11+ 是 instant)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALTER</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> TABLE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ADD</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> COLUMN </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">status</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> VARCHAR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">20</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">DEFAULT</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;pending&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- Step 2: 后台批量回填(虽然 11+ 默认值不需要回填,但已存在数据可能需要逻辑回填)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">UPDATE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">SET</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> status</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;completed&#39;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> WHERE</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> state</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> AND</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> status</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> IS</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> NULL</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- Step 3: 加 NOT NULL 约束(11+ 用 ALTER COLUMN SET NOT NULL,需要扫表但不锁表写)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALTER</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> TABLE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ADD</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> CONSTRAINT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders_status_not_null </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  CHECK</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">status</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> IS NOT NULL</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">NOT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> VALID;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- NOT VALID 不扫表</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALTER</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> TABLE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders VALIDATE </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">CONSTRAINT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> orders_status_not_null;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 扫表但只锁 SHARE</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- (PG 12+ 可以直接 ALTER COLUMN ... SET NOT NULL 复用上面的 CHECK 约束)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 重建表(空间回收 / 改聚簇):pg_repack</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">pg_repack </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">d production </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">t orders </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">j </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span></span></code></pre></div><p><strong>PG 的核心心法</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. CREATE INDEX 必须 CONCURRENTLY</span></span>
<span class="line"><span>2. ADD COLUMN 有默认值:11+ 是 INSTANT,11- 是锁表</span></span>
<span class="line"><span>3. NOT NULL 约束分两步:先 CHECK NOT VALID,再 VALIDATE</span></span>
<span class="line"><span>4. 大表回收 / 重写:pg_repack(避免 VACUUM FULL 锁表)</span></span></code></pre></div><p><strong>PG 和 MySQL 的最大差异</strong>:PG 的&quot;并发 DDL&quot;是原生支持,<strong>不需要 gh-ost 这种外部工具</strong>;但锁的语义更复杂,出问题更难调。</p><hr><h2 id="四、expand-contract-这一篇的核心" tabindex="-1">四、Expand-Contract:这一篇的核心 <a class="header-anchor" href="#四、expand-contract-这一篇的核心" aria-label="Permalink to &quot;四、Expand-Contract:这一篇的核心&quot;">​</a></h2><p>讲完单个 DDL 怎么不锁表,接下来是这一篇真正的核心——<strong>Expand-Contract 模式</strong>,一套让&quot;代码 / schema / 数据&quot;永远兼容的工程套路。</p><h3 id="_4-1-核心思想" tabindex="-1">4.1 核心思想 <a class="header-anchor" href="#_4-1-核心思想" aria-label="Permalink to &quot;4.1 核心思想&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统方式(灾难):</span></span>
<span class="line"><span>  改 schema + 改代码同步部署</span></span>
<span class="line"><span>  → 部署过程中新老代码并存撞 schema</span></span>
<span class="line"><span>  → 任一环节不兼容就是事故</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Expand-Contract 方式:</span></span>
<span class="line"><span>  把&quot;改 schema&quot;拆成两个阶段:</span></span>
<span class="line"><span>    Expand:  加新结构,新老都能跑</span></span>
<span class="line"><span>    Contract:删旧结构,只有新代码能跑</span></span>
<span class="line"><span>  中间用多次发布让代码逐步迁移</span></span></code></pre></div><h3 id="_4-2-状态机" tabindex="-1">4.2 状态机 <a class="header-anchor" href="#_4-2-状态机" aria-label="Permalink to &quot;4.2 状态机&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                  Expand-Contract 状态机                         │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                              │</span></span>
<span class="line"><span>│   ┌─────────────┐                                            │</span></span>
<span class="line"><span>│   │  T0: 起点    │  代码 v1 + Schema v1                       │</span></span>
<span class="line"><span>│   │             │  应用读写旧结构                            │</span></span>
<span class="line"><span>│   └─────┬───────┘                                            │</span></span>
<span class="line"><span>│         │                                                    │</span></span>
<span class="line"><span>│         │ DDL: Expand(加新列/表,不删旧)                       │</span></span>
<span class="line"><span>│         ▼                                                    │</span></span>
<span class="line"><span>│   ┌─────────────┐                                            │</span></span>
<span class="line"><span>│   │  T1: Expand │  代码 v1 + Schema v1 + 新结构(空)         │</span></span>
<span class="line"><span>│   │             │  老代码仍读写旧结构,新结构未启用            │</span></span>
<span class="line"><span>│   └─────┬───────┘                                            │</span></span>
<span class="line"><span>│         │                                                    │</span></span>
<span class="line"><span>│         │ Backfill 脚本:历史数据填到新结构                   │</span></span>
<span class="line"><span>│         ▼                                                    │</span></span>
<span class="line"><span>│   ┌─────────────┐                                            │</span></span>
<span class="line"><span>│   │  T2: Backfill│ 代码 v1 + Schema v1 + 新结构(已回填)     │</span></span>
<span class="line"><span>│   │             │ 新结构有完整历史数据,但应用还在读旧         │</span></span>
<span class="line"><span>│   └─────┬───────┘                                            │</span></span>
<span class="line"><span>│         │                                                    │</span></span>
<span class="line"><span>│         │ Deploy 代码 v2:双写(同时写旧 + 新)                │</span></span>
<span class="line"><span>│         ▼                                                    │</span></span>
<span class="line"><span>│   ┌─────────────┐                                            │</span></span>
<span class="line"><span>│   │  T3: Dual   │ 代码 v2(双写)+ Schema(新旧都有)         │</span></span>
<span class="line"><span>│   │   Write     │ 任何修改都同时写到旧 + 新结构,保持一致      │</span></span>
<span class="line"><span>│   └─────┬───────┘                                            │</span></span>
<span class="line"><span>│         │                                                    │</span></span>
<span class="line"><span>│         │ Deploy 代码 v3:读新结构,继续双写                  │</span></span>
<span class="line"><span>│         ▼                                                    │</span></span>
<span class="line"><span>│   ┌─────────────┐                                            │</span></span>
<span class="line"><span>│   │  T4: Read   │ 代码 v3(读新写双)                          │</span></span>
<span class="line"><span>│   │   New       │ 应用所有读路径已迁到新结构                  │</span></span>
<span class="line"><span>│   └─────┬───────┘                                            │</span></span>
<span class="line"><span>│         │                                                    │</span></span>
<span class="line"><span>│         │ Deploy 代码 v4:只写新,不再写旧                    │</span></span>
<span class="line"><span>│         ▼                                                    │</span></span>
<span class="line"><span>│   ┌─────────────┐                                            │</span></span>
<span class="line"><span>│   │  T5: Stop    │ 代码 v4(只新)                              │</span></span>
<span class="line"><span>│   │   Old Write │ 旧结构不再有新写入,但保留作 fallback        │</span></span>
<span class="line"><span>│   └─────┬───────┘                                            │</span></span>
<span class="line"><span>│         │                                                    │</span></span>
<span class="line"><span>│         │ DDL: Contract(删旧结构)                            │</span></span>
<span class="line"><span>│         ▼                                                    │</span></span>
<span class="line"><span>│   ┌─────────────┐                                            │</span></span>
<span class="line"><span>│   │  T6: Done   │ 代码 v4 + Schema v2(只有新结构)             │</span></span>
<span class="line"><span>│   │             │ 旧结构彻底删除                             │</span></span>
<span class="line"><span>│   └─────────────┘                                            │</span></span>
<span class="line"><span>│                                                              │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>每一步都是独立可回滚的</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T1 → T0:DROP COLUMN(新结构是空的,数据没丢)</span></span>
<span class="line"><span>T2 → T1:可选删 backfill,但留着也无害(新结构未启用)</span></span>
<span class="line"><span>T3 → T2:代码 rollback 到 v1,因为双写期数据一致,新结构有完整数据</span></span>
<span class="line"><span>T4 → T3:代码 rollback 到 v2,读路径切回旧结构(旧结构还在被双写)</span></span>
<span class="line"><span>T5 → T4:代码 rollback 到 v3,恢复双写</span></span>
<span class="line"><span>T6 → 不能回!  ← 唯一不可逆的点</span></span></code></pre></div><p><strong>关键洞察</strong>:<strong>只有 T6 是不可逆的</strong>。前面五步都能 rollback——这就是 Expand-Contract 的工程价值。</p><h3 id="_4-3-一句话总结" tabindex="-1">4.3 一句话总结 <a class="header-anchor" href="#_4-3-一句话总结" aria-label="Permalink to &quot;4.3 一句话总结&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Expand → Migrate → Contract</span></span>
<span class="line"><span>─────    ───────    ────────</span></span>
<span class="line"><span>加新     回填+双写  删旧</span></span>
<span class="line"><span>不删旧   慢慢切     最后一步</span></span></code></pre></div><hr><h2 id="五、完整例子-users-email-拆成-email-email-verified" tabindex="-1">五、完整例子:users.email 拆成 email + email_verified <a class="header-anchor" href="#五、完整例子-users-email-拆成-email-email-verified" aria-label="Permalink to &quot;五、完整例子:users.email 拆成 email + email_verified&quot;">​</a></h2><p>抽象讲完,<strong>这一节用一个最常见的场景把整个流程串起来</strong>。这是 100% 真实的场景——几乎每个团队都会撞上一次。</p><h3 id="_5-1-背景" tabindex="-1">5.1 背景 <a class="header-anchor" href="#_5-1-背景" aria-label="Permalink to &quot;5.1 背景&quot;">​</a></h3><p><strong>起点 schema</strong>(v1):</p><div class="language-sql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">sql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">CREATE</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> TABLE</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> users</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  id           </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">BIGINT</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> PRIMARY KEY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  username     </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">VARCHAR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">50</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">NOT NULL</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  email        </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">VARCHAR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">255</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">NOT NULL</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> DEFAULT</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  -- 业务约定:email = &#39;&#39; 表示未验证邮箱</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  -- email = &#39;xxx@yyy&#39; 表示验证成功的邮箱</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  -- 不存在&quot;已知邮箱但未验证&quot;的状态</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  created_at   </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">TIMESTAMP</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> NOT NULL</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">);</span></span></code></pre></div><p><strong>起点代码</strong>(v1):</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># v1 代码:用 email 是否为空判断是否已验证</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> is_email_verified</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> user.email </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">!=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> register</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(username, email):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 注册时 email 留空,等用户点验证链接才填入</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> User(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">username</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">username, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">email</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db.save(user)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    send_verification(email, user.id)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> user</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> confirm_email</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user_id, email):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> User.get(user_id)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user.email </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 验证成功才赋值</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db.save(user)</span></span></code></pre></div><p><strong>业务需求</strong>:<strong>要支持&quot;用户已经填了邮箱,但还没验证&quot;的状态</strong>——比如让用户在登录时就能看到自己未验证的邮箱。</p><p><strong>目标 schema</strong>(v2):</p><div class="language-sql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">sql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">CREATE</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> TABLE</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> users</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  id              </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">BIGINT</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> PRIMARY KEY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  username        </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">VARCHAR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">50</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">NOT NULL</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  email           </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">VARCHAR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">255</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">NOT NULL</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> DEFAULT</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  email_verified  </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">BOOLEAN</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> NOT NULL</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> DEFAULT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> FALSE,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  created_at      </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">TIMESTAMP</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> NOT NULL</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">);</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 新约定:email 可以是任意状态(未验证 / 已验证),email_verified 单独判定</span></span></code></pre></div><h3 id="_5-2-错误做法-给你制造事故那种" tabindex="-1">5.2 错误做法(给你制造事故那种) <a class="header-anchor" href="#_5-2-错误做法-给你制造事故那种" aria-label="Permalink to &quot;5.2 错误做法(给你制造事故那种)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T+0  写迁移脚本:</span></span>
<span class="line"><span>     ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;</span></span>
<span class="line"><span>     -- 同时全员部署 v2 代码,代码逻辑改成:</span></span>
<span class="line"><span>     -- def is_email_verified(user): return user.email_verified</span></span>
<span class="line"><span>     -- def register(username, email): user = User(username, email, email_verified=False); ...</span></span>
<span class="line"><span>     -- def confirm_email(...): user.email_verified = True; ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>T+0  DBA 跑 ALTER,假设没锁表(8.0 INSTANT)</span></span>
<span class="line"><span>T+1  开始部署 v2 代码</span></span>
<span class="line"><span>T+1~5 v1 / v2 共存 5 分钟</span></span>
<span class="line"><span>       老 v1 pod:还在用 email == &#39;&#39; 判定未验证</span></span>
<span class="line"><span>       新 v2 pod:用 email_verified 判定,但所有用户的 email_verified 是 FALSE</span></span>
<span class="line"><span>       → 所有&quot;已验证的老用户&quot;在 v2 pod 上都被显示为&quot;未验证&quot;</span></span>
<span class="line"><span>       → 用户登录看到&quot;未验证你的邮箱&quot;,一脸懵</span></span>
<span class="line"><span>       → 客服爆炸</span></span>
<span class="line"><span>T+5  v2 全部署完</span></span>
<span class="line"><span>       但所有&quot;已验证用户&quot;的 email_verified 都是 FALSE(默认值),需要回填</span></span>
<span class="line"><span>       现在搞回填,但生产已经有半小时的乱套数据</span></span></code></pre></div><p><strong>根因</strong>:<strong>一次性切代码 + schema + 业务语义</strong>。新老代码对&quot;已验证&quot;的判定逻辑不一样,共存期数据语义错乱。</p><h3 id="_5-3-正确做法-5-步-expand-contract" tabindex="-1">5.3 正确做法:5 步 Expand-Contract <a class="header-anchor" href="#_5-3-正确做法-5-步-expand-contract" aria-label="Permalink to &quot;5.3 正确做法:5 步 Expand-Contract&quot;">​</a></h3><h4 id="step-1-expand-加-email-verified-列-默认-false" tabindex="-1"><strong>Step 1:Expand(加 email_verified 列,默认 FALSE)</strong> <a class="header-anchor" href="#step-1-expand-加-email-verified-列-默认-false" aria-label="Permalink to &quot;**Step 1:Expand(加 email_verified 列,默认 FALSE)**&quot;">​</a></h4><p><strong>DDL</strong>:</p><div class="language-sql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">sql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 8.0 INSTANT,1 秒搞定</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ALTER</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> TABLE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> users </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ADD</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> COLUMN email_verified </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">BOOLEAN</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> NOT NULL</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> DEFAULT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> FALSE,</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  ALGORITHM=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">INSTANT;</span></span></code></pre></div><p><strong>代码状态</strong>:还是 v1,不动。</p><p><strong>这一步的状态</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>schema 有 email_verified 列,所有现有用户该列 = FALSE</span></span>
<span class="line"><span>v1 代码完全不知道这个列,继续用 email == &#39;&#39; 判定</span></span>
<span class="line"><span>新增列对 v1 代码 0 影响</span></span>
<span class="line"><span></span></span>
<span class="line"><span>可回滚:ALTER TABLE users DROP COLUMN email_verified</span></span>
<span class="line"><span>       数据无损失(从来没启用过)</span></span></code></pre></div><p><strong>关键检查</strong>:<strong>确认 DDL 不会失败</strong>——8.0 INSTANT 对 ADD COLUMN with DEFAULT 是支持的;5.7 会用 INPLACE 走 online DDL 也不锁;5.6 必须用 gh-ost。<strong>任何版本都不能直接 ALTER 走 COPY 模式</strong>。</p><h4 id="step-2-backfill-根据历史数据填充新列" tabindex="-1"><strong>Step 2:Backfill(根据历史数据填充新列)</strong> <a class="header-anchor" href="#step-2-backfill-根据历史数据填充新列" aria-label="Permalink to &quot;**Step 2:Backfill(根据历史数据填充新列)**&quot;">​</a></h4><p><strong>为什么必须这一步</strong>:<strong>默认 FALSE 是错的</strong>——对于已经 <code>email != &#39;&#39;</code> 的老用户,他们其实是&quot;已验证&quot;状态,应该填 TRUE。</p><p><strong>Backfill 脚本</strong>(Python 伪代码):</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> time</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> logging</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> sqlalchemy </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> text</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> backfill_email_verified</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(db, batch_size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1000</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, sleep_ms</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">200</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">):</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;&quot;&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    幂等回填 email_verified 列</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    幂等性来自 WHERE email_verified = FALSE 条件 - 已处理的不会再动</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    断点续跑:从 max(id) 继续</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;&quot;&quot;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 找到当前最大 ID(可恢复点)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    checkpoint </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> load_checkpoint() </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">or</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    while</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 找出&quot;email 已填(暗示历史已验证)但 email_verified 还是 FALSE&quot;的行</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        rows </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> db.execute(text(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;&quot;&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            SELECT id FROM users</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            WHERE id &gt; :checkpoint</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              AND email &lt;&gt; &#39;&#39;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              AND email_verified = FALSE</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            ORDER BY id</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            LIMIT :batch_size</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        &quot;&quot;&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">), {</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;checkpoint&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: checkpoint, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;batch_size&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: batch_size}).fetchall()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> not</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rows:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            break</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 处理完了</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ids </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [r[</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">] </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> r </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rows]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        last_id </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ids[</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 单次 UPDATE 一批,不要一条一条</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        db.execute(text(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;&quot;&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            UPDATE users</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            SET email_verified = TRUE</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            WHERE id IN :ids</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              AND email &lt;&gt; &#39;&#39;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              AND email_verified = FALSE</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        &quot;&quot;&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">), {</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;ids&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">tuple</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(ids)})</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        db.commit()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        save_checkpoint(last_id)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        logging.info(</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;backfilled up to id=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">{</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">last_id</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">, count=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">{len</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(ids)</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 监控复制延迟,延迟超过 2s 就 sleep 更久</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        lag </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> check_replication_lag(db)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        sleep_sec </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> sleep_ms </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">/</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1000.0</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> +</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> lag)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        time.sleep(sleep_sec)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        checkpoint </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> last_id</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> check_replication_lag</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(db):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 返回从库延迟秒数</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    result </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> db.execute(text(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;SHOW SLAVE STATUS&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)).fetchone()</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> result.Seconds_Behind_Master </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">or</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0</span></span></code></pre></div><p><strong>这一步的状态</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>所有 email &lt;&gt; &#39;&#39; 的用户:email_verified = TRUE</span></span>
<span class="line"><span>所有 email = &#39;&#39; 的用户:email_verified = FALSE(默认值不变)</span></span>
<span class="line"><span>代码仍然是 v1,逻辑 is_email_verified = (email != &#39;&#39;)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 新列的真值和旧逻辑一致,但应用还没切到读新列</span></span>
<span class="line"><span></span></span>
<span class="line"><span>可回滚:相当于&quot;白回填&quot;了——数据没什么坏处</span></span>
<span class="line"><span>       严格来说不需要回滚,留着也没事</span></span></code></pre></div><p><strong>关键纪律</strong>(7 条踩坑里第 7 条重点讲):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 必须分批 + sleep + 监控复制延迟</span></span>
<span class="line"><span>✓ 必须 idempotent(可重跑) + checkpoint(可断点续跑)</span></span>
<span class="line"><span>✓ 必须有 dry-run 模式(先打印 SQL 不执行)</span></span>
<span class="line"><span>✓ 高峰期不跑(夜间 / 业务低峰)</span></span>
<span class="line"><span>✓ 监控 binlog 增长速度,避免打爆磁盘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 绝对不要写 &quot;UPDATE users SET email_verified = TRUE WHERE email &lt;&gt; &#39;&#39;&quot;</span></span>
<span class="line"><span>   这会一次锁所有行,8 亿行表会卡死</span></span>
<span class="line"><span>✗ 不要写&quot;WHERE id BETWEEN 0 AND 1000000000&quot;这种宽范围批</span></span>
<span class="line"><span>   要 LIMIT N + 移动 checkpoint</span></span></code></pre></div><h4 id="step-3-dual-write-部署代码-v2-双写新列" tabindex="-1"><strong>Step 3:Dual Write(部署代码 v2:双写新列)</strong> <a class="header-anchor" href="#step-3-dual-write-部署代码-v2-双写新列" aria-label="Permalink to &quot;**Step 3:Dual Write(部署代码 v2:双写新列)**&quot;">​</a></h4><p><strong>代码 v2</strong>:<strong>写路径双写,读路径不变</strong>。</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># v2 代码</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> is_email_verified</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 读还是用旧逻辑(为了和 v1 共存期兼容)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> user.email </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">!=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> register</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(username, email):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 注册时:email 留空(兼容 v1),email_verified=FALSE</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> User(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">username</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">username, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">email</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">email_verified</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db.save(user)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    send_verification(email, user.id)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> user</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> confirm_email</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user_id, email):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 验证时:双写——填 email 同时设置 email_verified=TRUE</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> User.get(user_id)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user.email </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email             </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 旧逻辑</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user.email_verified </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> True</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     # 新逻辑</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db.save(user)</span></span></code></pre></div><p><strong>部署</strong>:<strong>走渐进发布(金丝雀)</strong> 把 v2 推到 100%。</p><p><strong>这一步的状态</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>共存期(v1 / v2 渐进切换 ~30 分钟):</span></span>
<span class="line"><span>  - v1 pod 处理的请求:写 email,不动 email_verified</span></span>
<span class="line"><span>  - v2 pod 处理的请求:写 email + email_verified</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  危险点:某用户被 v1 处理了验证,email_verified 没设</span></span>
<span class="line"><span>  → 此时该用户:email != &#39;&#39; 但 email_verified = FALSE</span></span>
<span class="line"><span>  → 旧 is_email_verified() 看 email != &#39;&#39; = TRUE,正确</span></span>
<span class="line"><span>  → 新逻辑(还没启用)看 email_verified = FALSE,错误</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  ★ 但因为读路径还在 v2 中也使用旧逻辑,这个不一致暂时不影响业务</span></span>
<span class="line"><span></span></span>
<span class="line"><span>共存期结束(v2 100%):</span></span>
<span class="line"><span>  从此所有新验证都正确双写</span></span>
<span class="line"><span>  剩下的不一致来自共存期那 30 分钟内的少量验证</span></span>
<span class="line"><span>  → 短时间再跑一次 backfill 收尾</span></span>
<span class="line"><span></span></span>
<span class="line"><span>可回滚:rollback 到 v1</span></span>
<span class="line"><span>   v1 代码继续用 email != &#39;&#39; 判定,</span></span>
<span class="line"><span>   email_verified 列还在 schema 里但 v1 不读不写,</span></span>
<span class="line"><span>   等同于&quot;没启用&quot;,无伤</span></span></code></pre></div><p><strong>关键细节</strong>:<strong>部署 v2 之前必须确认 Step 2 backfill 已经跑完</strong>——否则 v2 的写入会和&quot;FALSE 默认值的老数据&quot;混合,后续切换会乱。</p><h4 id="step-4-read-new-部署代码-v3-读切到新列-继续双写" tabindex="-1"><strong>Step 4:Read New(部署代码 v3:读切到新列,继续双写)</strong> <a class="header-anchor" href="#step-4-read-new-部署代码-v3-读切到新列-继续双写" aria-label="Permalink to &quot;**Step 4:Read New(部署代码 v3:读切到新列,继续双写)**&quot;">​</a></h4><p><strong>代码 v3</strong>:<strong>读路径切到新列,写路径仍双写</strong>。</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># v3 代码</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> is_email_verified</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # ★ 读切到新列</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> user.email_verified</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> register</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(username, email):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 写入仍双写</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> User(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">username</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">username, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">email</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">email_verified</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db.save(user)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    send_verification(email, user.id)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> user</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> confirm_email</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user_id, email):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> User.get(user_id)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user.email </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user.email_verified </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> True</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db.save(user)</span></span></code></pre></div><p><strong>部署</strong>:<strong>渐进发布到 100%</strong>。</p><p><strong>这一步的状态</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>共存期(v2 / v3):</span></span>
<span class="line"><span>  - v2 pod 读 email != &#39;&#39; 判定</span></span>
<span class="line"><span>  - v3 pod 读 email_verified 判定</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  因为 v2 写入时已经双写,两边读出来的判定结果应该一致</span></span>
<span class="line"><span>  ★ 前提:Step 2 的 backfill 已经 100% 跑完,没有遗漏</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  如果有 backfill 漏掉的行 → 现在会暴露(v3 读 FALSE,v2 读 TRUE)</span></span>
<span class="line"><span>  → 这就是为什么 backfill 完之后要做&quot;完整性校验&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>共存期结束(v3 100%):</span></span>
<span class="line"><span>  应用所有读路径用 email_verified</span></span>
<span class="line"><span>  应用所有写路径双写</span></span>
<span class="line"><span></span></span>
<span class="line"><span>可回滚:rollback 到 v2</span></span>
<span class="line"><span>   写仍然是双写的,v2 读旧逻辑也能跑</span></span></code></pre></div><p><strong>关键检查</strong>:Step 3 → Step 4 的切换是这条线最敏感的一步——<strong>部署前必须做&quot;读路径一致性校验&quot;</strong>:</p><div class="language-sql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">sql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 验证脚本:找出 email != &#39;&#39; 但 email_verified = FALSE 的&quot;漏网之鱼&quot;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">SELECT</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> COUNT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">*</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> users </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">WHERE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&lt;&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;&#39;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> AND</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email_verified </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> FALSE;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 应该为 0(理论上)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 如果 &gt; 0:再跑一次 backfill,且分析漏掉的原因</span></span></code></pre></div><p><strong>这个检查必须在 v3 上线前做</strong> —— 不做就上,等于&quot;赌没有漏&quot;;做了发现 &gt; 0 就再跑 backfill,清零再上线。</p><h4 id="step-5-contract-部署代码-v4-停旧含义-删旧约定" tabindex="-1"><strong>Step 5:Contract(部署代码 v4:停旧含义 + 删旧约定)</strong> <a class="header-anchor" href="#step-5-contract-部署代码-v4-停旧含义-删旧约定" aria-label="Permalink to &quot;**Step 5:Contract(部署代码 v4:停旧含义 + 删旧约定)**&quot;">​</a></h4><p><strong>这一步的本质是&quot;业务语义&quot;的迁移</strong>:从&quot;email = &#39;&#39; 表示未验证&quot;迁到&quot;email_verified 字段表示验证&quot;,<strong>旧约定彻底废除</strong>。</p><p><strong>代码 v4</strong>:</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># v4 代码</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> is_email_verified</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> user.email_verified</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> register</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(username, email):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # ★ 关键变化:注册时直接存 email,不再留空</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 这意味着 email != &#39;&#39; 不再保证&quot;已验证&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> User(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">username</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">username, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">email</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">email, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">email_verified</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db.save(user)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    send_verification(email, user.id)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> user</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> confirm_email</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user_id):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # ★ 不再传 email 参数(因为 email 已经在注册时存了)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 只更新 email_verified</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> User.get(user_id)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user.email_verified </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> True</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db.save(user)</span></span></code></pre></div><p><strong>部署</strong>:<strong>渐进发布到 100%</strong>。</p><p><strong>这一步的状态</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>共存期(v3 / v4):</span></span>
<span class="line"><span>  - v3 pod 仍执行&quot;register 时存 email=&#39;&#39;&quot;</span></span>
<span class="line"><span>  - v4 pod 执行&quot;register 时存 email=完整邮箱,email_verified=FALSE&quot;</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  风险:同一时段内有些新用户被 v3 注册(email=&#39;&#39;),有些被 v4 注册(email!=&#39;&#39;)</span></span>
<span class="line"><span>  → 已经混合了,但这没问题:</span></span>
<span class="line"><span>     v3 读 email_verified 是 FALSE,正确</span></span>
<span class="line"><span>     v4 读 email_verified 是 FALSE,正确</span></span>
<span class="line"><span>  → 旧约定&quot;email == &#39;&#39; 表示未验证&quot;在 v3 视角下不再成立,</span></span>
<span class="line"><span>     但 v3 已经不用这个约定来判定了</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  ★ 这一步是&quot;业务语义&quot;的删除——旧约定不再有效</span></span>
<span class="line"><span></span></span>
<span class="line"><span>共存期结束(v4 100%):</span></span>
<span class="line"><span>  所有新用户的 email 字段都是完整邮箱(无论验证与否)</span></span>
<span class="line"><span>  email_verified 是唯一的验证状态判定</span></span>
<span class="line"><span></span></span>
<span class="line"><span>可回滚:rollback 到 v3</span></span>
<span class="line"><span>   v3 代码 register 时存 email=&#39;&#39;</span></span>
<span class="line"><span>   v3 读 email_verified</span></span>
<span class="line"><span>   但已经被 v4 写入的&quot;email != &#39;&#39; 且 email_verified=FALSE&quot;的用户,</span></span>
<span class="line"><span>   在 v3 看来是&quot;未验证但 email != &#39;&#39;&quot;,</span></span>
<span class="line"><span>   v3 不会&quot;主动重置 email=&#39;&#39;&quot;,所以这部分数据保留</span></span>
<span class="line"><span>   功能正常,只是 v3 的 register 路径不会创建这种状态了</span></span></code></pre></div><p><strong>Step 5 的关键纪律</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 在 Step 5 之前,Step 4 必须已经 100% 跑了至少 1 周</span></span>
<span class="line"><span>   → 确认没有任何 v2 / v3 残留 pod</span></span>
<span class="line"><span>   → 确认没有未观察到的边缘 case</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. Step 5 不删 email 列,只是&quot;业务约定变了&quot;</span></span>
<span class="line"><span>   → 真正的 DROP COLUMN 是另一个独立的 schema 变更</span></span>
<span class="line"><span>   → 但 email 列本身在这个例子里是要保留的,只是约定改了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 如果 Step 5 包含真正的 DROP COLUMN(比如有第二个旧约定列 email_legacy):</span></span>
<span class="line"><span>   → 必须等&quot;代码 v4 上线 + 观察 1 周&quot;再 DROP</span></span>
<span class="line"><span>   → DROP 之前再确认一次没有任何写入 / 读取 email_legacy 的代码</span></span>
<span class="line"><span>   → DROP 后这一步不可回滚,前面所有 step 都要确认稳了</span></span></code></pre></div><h3 id="_5-4-关键总结" tabindex="-1">5.4 关键总结 <a class="header-anchor" href="#_5-4-关键总结" aria-label="Permalink to &quot;5.4 关键总结&quot;">​</a></h3><p>把上面 5 步压成一张时间线:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                 schema                  代码版本</span></span>
<span class="line"><span>T0  起点          email                   v1   (读 email != &#39;&#39; 判定验证)</span></span>
<span class="line"><span>T1  Step 1 Expand email, email_verified   v1   (默认 FALSE,代码不知道新列)</span></span>
<span class="line"><span>T2  Step 2 Backfill              same     v1   (后台脚本把历史数据填到 email_verified)</span></span>
<span class="line"><span>T3  Step 3 Dual    same                   v2   (写双写,读还是旧)</span></span>
<span class="line"><span>T4  Step 4 Read    same                   v3   (读 email_verified,写仍双写)</span></span>
<span class="line"><span>T5  Step 5 Contract same                  v4   (放弃 &quot;email==&#39;&#39;表示未验证&quot; 旧约定)</span></span>
<span class="line"><span>T6  最终          email, email_verified   v4   (业务上只用 email_verified)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每一步的回滚:</span></span>
<span class="line"><span>  T0 → 无</span></span>
<span class="line"><span>  T1 → T0(DROP COLUMN,无数据)</span></span>
<span class="line"><span>  T2 → T1(无需回滚)</span></span>
<span class="line"><span>  T3 → T2(rollback 代码)</span></span>
<span class="line"><span>  T4 → T3(rollback 代码)</span></span>
<span class="line"><span>  T5 → T4(rollback 代码,但 v4 创建的数据残留,业务无影响)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 整条线没有&quot;不可逆&quot;的点(因为我们没真 DROP COLUMN)</span></span>
<span class="line"><span>→ 这就是 Expand-Contract 的工程价值</span></span></code></pre></div><p><strong>真实生产里这 5 步通常间隔 1-3 天到 1-2 周</strong> —— 不要急。<strong>急 = 出事</strong>。</p><hr><h2 id="六、orm-迁移工具-liquibase-flyway-atlas" tabindex="-1">六、ORM 迁移工具:Liquibase / Flyway / Atlas <a class="header-anchor" href="#六、orm-迁移工具-liquibase-flyway-atlas" aria-label="Permalink to &quot;六、ORM 迁移工具:Liquibase / Flyway / Atlas&quot;">​</a></h2><p>讲完 Expand-Contract 心法,需要工具把&quot;DDL 序列&quot;管起来。<strong>手写 DDL 文件、手动跑、靠注释记顺序 = 必然走样</strong>。</p><h3 id="_6-1-主流工具对比" tabindex="-1">6.1 主流工具对比 <a class="header-anchor" href="#_6-1-主流工具对比" aria-label="Permalink to &quot;6.1 主流工具对比&quot;">​</a></h3><table tabindex="0"><thead><tr><th>工具</th><th>模型</th><th>优势</th><th>劣势</th></tr></thead><tbody><tr><td><strong>Liquibase</strong></td><td>XML / YAML / SQL changeset</td><td>支持回滚 / 多数据库 / 大企业级</td><td>XML 啰嗦,新人学习成本高</td></tr><tr><td><strong>Flyway</strong></td><td>版本化 SQL 文件(<code>V1__init.sql</code>)</td><td>简单粗暴,SQL-first</td><td><strong>不支持自动回滚</strong></td></tr><tr><td><strong>Atlas</strong></td><td>声明式 schema-as-code</td><td>schema 写在文件里,Atlas 算 diff 自动生成 DDL</td><td>新工具,生态尚浅</td></tr><tr><td><strong>Goose</strong>(Go 生态)</td><td>SQL 文件 + 简单 up/down</td><td>Go 项目原生,轻量</td><td>仅 Go 项目</td></tr><tr><td><strong>Alembic</strong>(Python 生态)</td><td>Python 脚本 + 自动 detect</td><td>SQLAlchemy 配套,detect schema 改动</td><td>仅 Python 项目</td></tr></tbody></table><h3 id="_6-2-选型逻辑" tabindex="-1">6.2 选型逻辑 <a class="header-anchor" href="#_6-2-选型逻辑" aria-label="Permalink to &quot;6.2 选型逻辑&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>中型团队多语言混合 → Liquibase 或 Atlas</span></span>
<span class="line"><span>                     都是语言无关的</span></span>
<span class="line"><span>                     </span></span>
<span class="line"><span>喜欢 SQL-first 的简单团队 → Flyway</span></span>
<span class="line"><span>                         注意:Flyway 不支持自动回滚,要手写 Vxx__rollback.sql</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Go 全栈            → Goose</span></span>
<span class="line"><span>Python 全栈        → Alembic</span></span>
<span class="line"><span>Java + JPA         → Liquibase(Hibernate 集成最好)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>希望&quot;声明式&quot; → Atlas</span></span>
<span class="line"><span>            把 schema 当代码,Atlas 算 diff</span></span>
<span class="line"><span>            适合习惯了 Terraform / K8s YAML 的团队</span></span></code></pre></div><h3 id="_6-3-atlas-示例-声明式-schema" tabindex="-1">6.3 Atlas 示例:声明式 schema <a class="header-anchor" href="#_6-3-atlas-示例-声明式-schema" aria-label="Permalink to &quot;6.3 Atlas 示例:声明式 schema&quot;">​</a></h3><p><strong>schema.hcl</strong>(声明式的 schema 定义):</p><div class="language-hcl vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">hcl</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">table</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> &quot;users&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  schema</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> schema</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">public</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  column</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> &quot;id&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    null</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    type</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> bigint</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    identity</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      generated</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ALWAYS</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  }</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  column</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> &quot;username&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    null</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    type</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> varchar</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">50</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  }</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  column</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> &quot;email&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    null</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    type</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> varchar</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">255</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    default</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  }</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  column</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> &quot;email_verified&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    null</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    type</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> boolean</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    default</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> false</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  }</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  column</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> &quot;created_at&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    null</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    type</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> timestamp</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  }</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  primary_key</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    columns</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [column</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">id]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>算 diff 生成 DDL</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> atlas</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> migrate</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> diff</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> add_email_verified</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --dir</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;file://migrations&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --to</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;file://schema.hcl&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --dev-url</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;docker://postgres/15&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 生成的 migration 文件:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># migrations/20260511_120000_add_email_verified.sql</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ----------------------------------------</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># -- Modify &quot;users&quot; table</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ALTER TABLE &quot;users&quot; ADD COLUMN &quot;email_verified&quot; boolean NOT NULL DEFAULT false;</span></span></code></pre></div><p><strong>Atlas 的核心价值</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. schema 是声明式的(类似 Terraform):</span></span>
<span class="line"><span>   - 写&quot;我想要 schema 长这样&quot;</span></span>
<span class="line"><span>   - Atlas 算&quot;现在 vs 想要&quot;的 diff</span></span>
<span class="line"><span>   - 生成 DDL</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 强制审查每次 diff:</span></span>
<span class="line"><span>   - 不能直接 apply,先 review 生成的 SQL</span></span>
<span class="line"><span>   - 防止 Atlas 算错或意外删列</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. lint 检测危险变更:</span></span>
<span class="line"><span>   atlas migrate lint --dir migrations --dev-url docker://postgres/15</span></span>
<span class="line"><span>   - 检测&quot;不可逆 DROP&quot;&quot;锁表风险&quot;等</span></span>
<span class="line"><span>   - 把&quot;破坏性变更&quot;挡在合入主分支前</span></span></code></pre></div><h3 id="_6-4-任何工具都解决不了的事" tabindex="-1">6.4 任何工具都解决不了的事 <a class="header-anchor" href="#_6-4-任何工具都解决不了的事" aria-label="Permalink to &quot;6.4 任何工具都解决不了的事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工具能做:</span></span>
<span class="line"><span>  - DDL 文件版本化</span></span>
<span class="line"><span>  - 顺序执行 / 跳过已执行</span></span>
<span class="line"><span>  - 检测一些危险模式</span></span>
<span class="line"><span></span></span>
<span class="line"><span>工具不能做:</span></span>
<span class="line"><span>  - 帮你设计 Expand-Contract 序列</span></span>
<span class="line"><span>  - 替你做新老代码兼容验证</span></span>
<span class="line"><span>  - 阻止你写错回填脚本</span></span>
<span class="line"><span>  - 处理数据迁移的幂等性 / 断点续跑</span></span></code></pre></div><p><strong>工具是助手,不是替代品</strong>——Expand-Contract 的思维永远是工程师的责任。</p><hr><h2 id="七、发布顺序-这一节决定事故还是平安" tabindex="-1">七、发布顺序:这一节决定事故还是平安 <a class="header-anchor" href="#七、发布顺序-这一节决定事故还是平安" aria-label="Permalink to &quot;七、发布顺序:这一节决定事故还是平安&quot;">​</a></h2><p><strong>这一节是这一篇里最容易踩的坑</strong>——大部分团队都会撞一次,撞了才记住。</p><h3 id="_7-1-正确顺序-老代码必须兼容新-schema" tabindex="-1">7.1 正确顺序:老代码必须兼容新 schema <a class="header-anchor" href="#_7-1-正确顺序-老代码必须兼容新-schema" aria-label="Permalink to &quot;7.1 正确顺序:老代码必须兼容新 schema&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>正确发布顺序:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Step A: 部署 schema 变更                                      │</span></span>
<span class="line"><span>│           - DDL: ADD COLUMN(默认值)                            │</span></span>
<span class="line"><span>│           - 老代码不知道新列,继续运行,无影响                   │</span></span>
<span class="line"><span>│                                                              │</span></span>
<span class="line"><span>│  Step B: 部署新代码 v2(双写)                                   │</span></span>
<span class="line"><span>│           - 新代码读旧字段,写新+旧字段                          │</span></span>
<span class="line"><span>│           - 共存期老 v1 不写新字段(但默认值 / 后台回填兜底)    │</span></span>
<span class="line"><span>│                                                              │</span></span>
<span class="line"><span>│  Step C: 部署新代码 v3(读新写双)                               │</span></span>
<span class="line"><span>│           - 新代码读新字段                                     │</span></span>
<span class="line"><span>│           - 老 v2 仍能跑(还在双写)                            │</span></span>
<span class="line"><span>│                                                              │</span></span>
<span class="line"><span>│  Step D: 部署新代码 v4(只新)                                  │</span></span>
<span class="line"><span>│           - 不再写旧字段                                       │</span></span>
<span class="line"><span>│           - 旧字段保留,等&quot;足够安全&quot;再 DROP                     │</span></span>
<span class="line"><span>│                                                              │</span></span>
<span class="line"><span>│  Step E: 部署 schema 变更                                      │</span></span>
<span class="line"><span>│           - DDL: DROP 旧字段(如果适用)                          │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>核心铁律</strong>:<strong>任何时间点,正在运行的所有代码版本,都必须能在当前 schema 上正常工作</strong>。</p><h3 id="_7-2-错误顺序-先发用新字段的代码" tabindex="-1">7.2 错误顺序:先发用新字段的代码 <a class="header-anchor" href="#_7-2-错误顺序-先发用新字段的代码" aria-label="Permalink to &quot;7.2 错误顺序:先发用新字段的代码&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误顺序:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>T+0   先发布 v2 代码,代码用 email_verified 列</span></span>
<span class="line"><span>T+0   v2 代码上线,SELECT email_verified FROM users WHERE id = 123</span></span>
<span class="line"><span>       schema 没有这列 → SQL 报错 → 全员 5xx</span></span>
<span class="line"><span>T+1   团队意识到要先发 schema → 紧急跑 ALTER</span></span>
<span class="line"><span>T+1   ALTER 完成,5xx 消失,中间 1 分钟 ~3000 笔注册失败</span></span>
<span class="line"><span></span></span>
<span class="line"><span>教训:代码用一个不存在的列 / 表 = 立刻全员 5xx</span></span></code></pre></div><p><strong>这个坑的发生场景</strong>:<strong>团队没有&quot;先 schema 后代码&quot;的纪律</strong>,以为&quot;反正一起部署就行&quot;。但部署不是原子的——schema migration 跑 10 秒,代码滚动部署跑 5 分钟,<strong>这中间任何一刻 schema 和代码不匹配都是事故</strong>。</p><h3 id="_7-3-例外-删字段的反向顺序" tabindex="-1">7.3 例外:删字段的反向顺序 <a class="header-anchor" href="#_7-3-例外-删字段的反向顺序" aria-label="Permalink to &quot;7.3 例外:删字段的反向顺序&quot;">​</a></h3><p>DROP 字段的顺序刚好相反:<strong>先代码,后 schema</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>DROP 字段的正确顺序:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>T+0   v4 代码上线:不再读 / 写 legacy_field</span></span>
<span class="line"><span>T+0~10 共存期:旧 v3 还可能读 legacy_field,新 v4 不动它</span></span>
<span class="line"><span>T+10  v4 100% 部署完成,确认 1 周内没有任何代码引用 legacy_field</span></span>
<span class="line"><span>T+17  DDL: DROP COLUMN legacy_field</span></span>
<span class="line"><span>       此时代码已经不读不写这一列,删除安全</span></span>
<span class="line"><span></span></span>
<span class="line"><span>错误顺序:</span></span>
<span class="line"><span>T+0   DDL: DROP COLUMN legacy_field</span></span>
<span class="line"><span>T+0   v3 还在跑,SELECT legacy_field FROM users → 报错</span></span>
<span class="line"><span>      全员 5xx</span></span></code></pre></div><p><strong>记忆口诀</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ADD COLUMN:    schema 先,代码后(老代码兼容新 schema)</span></span>
<span class="line"><span>DROP COLUMN:   代码先,schema 后(新代码不需要旧 schema)</span></span>
<span class="line"><span>RENAME COLUMN: 拆成 ADD 新 + 双写 + 切读 + DROP 旧(Expand-Contract)</span></span></code></pre></div><h3 id="_7-4-gitops-里怎么落地这个顺序" tabindex="-1">7.4 GitOps 里怎么落地这个顺序 <a class="header-anchor" href="#_7-4-gitops-里怎么落地这个顺序" aria-label="Permalink to &quot;7.4 GitOps 里怎么落地这个顺序&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>在 GitOps 流里(参考 20 篇),通常是:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>仓库结构:</span></span>
<span class="line"><span>infra/</span></span>
<span class="line"><span>├── db-migrations/         ← Liquibase / Flyway / Atlas 管的 DDL</span></span>
<span class="line"><span>│   └── V20260511_001__add_email_verified.sql</span></span>
<span class="line"><span>└── apps/</span></span>
<span class="line"><span>    └── user-service/</span></span>
<span class="line"><span>        └── manifest.yaml  ← K8s 部署清单</span></span>
<span class="line"><span></span></span>
<span class="line"><span>发布流程(必须按顺序):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PR 1:  只改 db-migrations/</span></span>
<span class="line"><span>        - 加 ADD COLUMN</span></span>
<span class="line"><span>        - merge 后 CI 跑 migration</span></span>
<span class="line"><span>        - 等 1 天观察</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PR 2:  改 apps/user-service/manifest.yaml(部署 v2 代码,双写)</span></span>
<span class="line"><span>        - 等 v2 100% 上线 + 观察 1-3 天</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PR 3:  改 apps/user-service(部署 v3,读新)</span></span>
<span class="line"><span>        - 等 v3 100% + 观察 1 周</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PR 4:  改 apps/user-service(部署 v4,只新)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PR 5(如适用):改 db-migrations/(DROP 旧列)</span></span></code></pre></div><p><strong>任何想&quot;把这几个 PR 合一起&quot;的尝试都是事故制造机</strong> —— Expand-Contract 的核心就在于<strong>多个独立的小变更</strong>,合一起等于回到了一次性发布的老路。</p><hr><h2 id="八、数据迁移的幂等性-断点续跑" tabindex="-1">八、数据迁移的幂等性 / 断点续跑 <a class="header-anchor" href="#八、数据迁移的幂等性-断点续跑" aria-label="Permalink to &quot;八、数据迁移的幂等性 / 断点续跑&quot;">​</a></h2><p>回填 / 数据迁移脚本的工程纪律,值得单独一节。</p><h3 id="_8-1-幂等性是底线" tabindex="-1">8.1 幂等性是底线 <a class="header-anchor" href="#_8-1-幂等性是底线" aria-label="Permalink to &quot;8.1 幂等性是底线&quot;">​</a></h3><p><strong>幂等(idempotent)= 同一个脚本跑 N 次,结果和跑 1 次一样</strong>。</p><div class="language-sql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">sql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- ✗ 不幂等:重跑会重复发短信、重复扣余额、重复创建订单</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">INSERT INTO</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email_log (user_id, sent_at) </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  SELECT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> id, </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">NOW</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">() </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> users </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">WHERE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email_verified </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> FALSE;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- ✓ 幂等:用 INSERT IGNORE / ON DUPLICATE KEY / WHERE NOT EXISTS</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">INSERT IGNORE INTO</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email_log (user_id, sent_at)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  SELECT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> id, </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">NOW</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">() </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> users </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  WHERE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email_verified </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> FALSE </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    AND</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> id </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">NOT</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> IN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">SELECT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> user_id </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email_log);</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- ✓ 幂等(更优,用 ON DUPLICATE KEY):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">INSERT INTO</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email_log (user_id, sent_at)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  SELECT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> id, </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">NOW</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">() </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> users </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  WHERE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email_verified </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> FALSE</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  ON</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> DUPLICATE </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">KEY</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> UPDATE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> sent_at </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> sent_at;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 不动</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- ✗ 不幂等</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">UPDATE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> users </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">SET</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> balance </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> balance </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 100</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> WHERE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> last_login </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;2026-05-01&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 重跑两次余额加了 200</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- ✓ 幂等(加 marker):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">UPDATE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> users </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">SET</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> balance </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> balance </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 100</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, granted_bonus </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> TRUE</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  WHERE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> last_login </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;2026-05-01&#39;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> AND</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> granted_bonus </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> FALSE;</span></span></code></pre></div><p><strong>幂等性的核心:用条件让&quot;已处理&quot;和&quot;未处理&quot;明确分开</strong>。回填脚本写成&quot;已处理的不会再动&quot;,可以无限次重跑。</p><h3 id="_8-2-断点续跑" tabindex="-1">8.2 断点续跑 <a class="header-anchor" href="#_8-2-断点续跑" aria-label="Permalink to &quot;8.2 断点续跑&quot;">​</a></h3><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ✗ 一次跑完:跑到一半挂了,要从头来</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> backfill_naive</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(db):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    rows </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> db.query(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;SELECT id FROM users WHERE email_verified = FALSE&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> row </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rows:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        update_row(row.id)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ✓ 断点续跑:每批后保存进度</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> backfill_resumable</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(db):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    checkpoint </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> load_checkpoint() </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">or</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    while</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        rows </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> db.query(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;&quot;&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            SELECT id FROM users </span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            WHERE id &gt; </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">%s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> AND email_verified = FALSE</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            ORDER BY id </span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            LIMIT 1000</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        &quot;&quot;&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, (checkpoint,))</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> not</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rows:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            break</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> row </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rows:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            update_row(row.id)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        checkpoint </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rows[</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">].id</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        save_checkpoint(checkpoint)  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 写到文件 / Redis</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        time.sleep(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span></code></pre></div><p><strong>checkpoint 存哪里</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>轻量做法:本地文件 / Redis(脚本所在机器持久化即可)</span></span>
<span class="line"><span>中等做法:DB 的元数据表 progress 表</span></span>
<span class="line"><span>重量做法:专门的 migration 工具(Liquibase / Atlas)管理</span></span></code></pre></div><h3 id="_8-3-监控指标" tabindex="-1">8.3 监控指标 <a class="header-anchor" href="#_8-3-监控指标" aria-label="Permalink to &quot;8.3 监控指标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>回填脚本必须监控的 4 个指标:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>1. 已处理行数 / 总行数 (进度)</span></span>
<span class="line"><span>2. 处理速率 (rows/s)</span></span>
<span class="line"><span>3. 主从复制延迟 (秒)</span></span>
<span class="line"><span>4. binlog 增长速度 (MB/s)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>任一指标异常立刻暂停:</span></span>
<span class="line"><span>   - 复制延迟 &gt; 10s → sleep 加倍</span></span>
<span class="line"><span>   - binlog 增长 &gt; 阈值 → 减小 batch 或停</span></span>
<span class="line"><span>   - 处理速率突然下降 → 是不是撞锁?</span></span></code></pre></div><h3 id="_8-4-超大表-10-亿行-的策略" tabindex="-1">8.4 超大表(&gt;10 亿行)的策略 <a class="header-anchor" href="#_8-4-超大表-10-亿行-的策略" aria-label="Permalink to &quot;8.4 超大表(&gt;10 亿行)的策略&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>超大表的核心约束:</span></span>
<span class="line"><span>  - 全表扫描代价高(全表 IO + buffer pool 污染)</span></span>
<span class="line"><span>  - 一次大事务会撑爆 binlog</span></span>
<span class="line"><span>  - 长时间 backfill 期间业务流量变化大</span></span>
<span class="line"><span></span></span>
<span class="line"><span>策略:</span></span>
<span class="line"><span>1. 分时段:</span></span>
<span class="line"><span>   - 业务低峰跑(凌晨 2:00 - 6:00)</span></span>
<span class="line"><span>   - 高峰暂停 / 减速</span></span>
<span class="line"><span>   - 用 cron + 监控脚本切换状态</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 分批 + 小事务:</span></span>
<span class="line"><span>   - 每批 1000-5000 行</span></span>
<span class="line"><span>   - 每批一个事务,避免长事务</span></span>
<span class="line"><span>   - batch size 取决于该表的平均行宽度</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 监控复制延迟:</span></span>
<span class="line"><span>   - 主从延迟 &gt; 5s 立刻 sleep 加倍</span></span>
<span class="line"><span>   - 别让回填把从库打挂</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 监控 binlog 增长:</span></span>
<span class="line"><span>   - 一次回填可能产生几十 GB binlog</span></span>
<span class="line"><span>   - 备份系统能否承受?</span></span>
<span class="line"><span>   - GTID 同步能否赶上?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 进度可视化:</span></span>
<span class="line"><span>   - Grafana 上画&quot;剩余行数&quot;曲线</span></span>
<span class="line"><span>   - 估算&quot;剩余时间&quot;,方便对接业务窗口</span></span></code></pre></div><hr><h2 id="九、何时不该用-expand-contract" tabindex="-1">九、何时不该用 Expand-Contract <a class="header-anchor" href="#九、何时不该用-expand-contract" aria-label="Permalink to &quot;九、何时不该用 Expand-Contract&quot;">​</a></h2><p><strong>Expand-Contract 是有成本的</strong>——5 步迁移 + 多次发布 + 完整观察期,可能要 2 周。不是所有变更都值得这么搞。</p><h3 id="_9-1-该用-expand-contract-的场景" tabindex="-1">9.1 该用 Expand-Contract 的场景 <a class="header-anchor" href="#_9-1-该用-expand-contract-的场景" aria-label="Permalink to &quot;9.1 该用 Expand-Contract 的场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 改业务字段的语义(本篇例子)</span></span>
<span class="line"><span>✓ 拆字段(一个字段拆成两个)</span></span>
<span class="line"><span>✓ 合字段(两个字段合成一个)</span></span>
<span class="line"><span>✓ 改字段类型(VARCHAR → INT)</span></span>
<span class="line"><span>✓ 改约束(NULL → NOT NULL,有默认值的话)</span></span>
<span class="line"><span>✓ 表拆分(orders 表拆成 orders + order_items)</span></span>
<span class="line"><span>✓ 表合并(legacy_users + new_users 合并)</span></span>
<span class="line"><span>✓ 字段重命名(实质等于&quot;拆 + 改读 + 删旧&quot;)</span></span></code></pre></div><h3 id="_9-2-不用-expand-contract-的场景" tabindex="-1">9.2 不用 Expand-Contract 的场景 <a class="header-anchor" href="#_9-2-不用-expand-contract-的场景" aria-label="Permalink to &quot;9.2 不用 Expand-Contract 的场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 加索引</span></span>
<span class="line"><span>  - 直接 CREATE INDEX (CONCURRENTLY for PG / 用 gh-ost for MySQL)</span></span>
<span class="line"><span>  - 不影响业务逻辑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 加新表(完全独立)</span></span>
<span class="line"><span>  - 直接 CREATE TABLE</span></span>
<span class="line"><span>  - 老代码不知道这张表 = 无影响</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 加可选的 NULLable 列(代码也是可选地用)</span></span>
<span class="line"><span>  - 旧代码不读 = 无影响</span></span>
<span class="line"><span>  - 新代码读到 NULL 也能处理</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 短期实验表 / 临时数据</span></span>
<span class="line"><span>  - 实验完直接 DROP TABLE</span></span></code></pre></div><h3 id="_9-3-灰色地带" tabindex="-1">9.3 灰色地带 <a class="header-anchor" href="#_9-3-灰色地带" aria-label="Permalink to &quot;9.3 灰色地带&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>△ 加 NOT NULL 列(有默认值)</span></span>
<span class="line"><span>  - MySQL 8.0 INSTANT 可以一步搞定</span></span>
<span class="line"><span>  - PG 11+ 也可以一步</span></span>
<span class="line"><span>  - 但如果&quot;默认值不是业务正确值&quot;,还是要 Expand-Contract</span></span>
<span class="line"><span></span></span>
<span class="line"><span>△ 改字段长度(VARCHAR(50) → VARCHAR(100))</span></span>
<span class="line"><span>  - 大部分数据库支持 in-place 增长</span></span>
<span class="line"><span>  - 但缩短(100 → 50)必须 Expand-Contract(可能截断数据)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>△ 修改索引</span></span>
<span class="line"><span>  - DROP + CREATE,中间无索引期性能塌</span></span>
<span class="line"><span>  - 建议:先 CREATE 新索引,确认生效,再 DROP 老索引</span></span></code></pre></div><hr><h2 id="十、7-条踩坑" tabindex="-1">十、7 条踩坑 <a class="header-anchor" href="#十、7-条踩坑" aria-label="Permalink to &quot;十、7 条踩坑&quot;">​</a></h2><h3 id="_10-1-alter-table-直接跑-没用-online-ddl" tabindex="-1">10.1 <code>ALTER TABLE</code> 直接跑,没用 online DDL <a class="header-anchor" href="#_10-1-alter-table-直接跑-没用-online-ddl" aria-label="Permalink to &quot;10.1 \`ALTER TABLE\` 直接跑,没用 online DDL&quot;">​</a></h3><p><strong>症状</strong>:大表 ALTER 时主库锁表,业务全员 5xx。</p><p><strong>根因</strong>:<strong>MySQL 默认 ALTER 走 COPY 算法</strong>,8 亿行表要几小时全程锁。或者 PG <code>ADD COLUMN NOT NULL</code> 没分步,一次性锁表。</p><p><strong>避坑</strong>:<strong>严格分场景</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>MySQL:</span></span>
<span class="line"><span>  - 8.0+:能 INSTANT 的尽量 INSTANT</span></span>
<span class="line"><span>  - 5.7+ 的 INPLACE:大多数 ADD COLUMN 没问题</span></span>
<span class="line"><span>  - 5.6 / 5.7 不 INPLACE 的:gh-ost / pt-osc</span></span>
<span class="line"><span>  - 一律不用裸 ALTER on production</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PostgreSQL:</span></span>
<span class="line"><span>  - CREATE INDEX 必须 CONCURRENTLY</span></span>
<span class="line"><span>  - ADD COLUMN NOT NULL 必须分步(NULL + DEFAULT + CHECK NOT VALID + VALIDATE)</span></span>
<span class="line"><span>  - 大表重整必须 pg_repack,不能 VACUUM FULL</span></span></code></pre></div><h3 id="_10-2-外键约束阻塞迁移" tabindex="-1">10.2 外键约束阻塞迁移 <a class="header-anchor" href="#_10-2-外键约束阻塞迁移" aria-label="Permalink to &quot;10.2 外键约束阻塞迁移&quot;">​</a></h3><p><strong>症状</strong>:执行 ALTER 时报错或者卡住,原因是外键约束。</p><p><strong>根因</strong>:<strong>外键约束在 InnoDB 里是 metadata lock 持有者</strong>——任何对父表 / 子表的 ALTER 都可能等待这些锁。</p><p><strong>避坑</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 大型生产系统:**不在 DB 层用外键约束**</span></span>
<span class="line"><span>   - 业务一致性靠应用层保证 + 事务</span></span>
<span class="line"><span>   - 外键的性能 / 锁代价对中型团队不划算</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 已有外键的迁移:</span></span>
<span class="line"><span>   - gh-ost 用 --alter-foreign-keys-method=auto</span></span>
<span class="line"><span>   - pt-osc 用 --alter-foreign-keys-method=drop_swap(不推荐生产)</span></span>
<span class="line"><span>   - 或者迁移前临时禁用外键(SET FOREIGN_KEY_CHECKS = 0)</span></span>
<span class="line"><span>     但这会绕过完整性检查,慎用</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. PG 的外键:NOT VALID + VALIDATE 可以避免重扫</span></span>
<span class="line"><span>   ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) </span></span>
<span class="line"><span>     REFERENCES users(id) NOT VALID;</span></span>
<span class="line"><span>   ALTER TABLE orders VALIDATE CONSTRAINT fk_user;</span></span></code></pre></div><h3 id="_10-3-删字段时-orm-缓存了-schema" tabindex="-1">10.3 删字段时 ORM 缓存了 schema <a class="header-anchor" href="#_10-3-删字段时-orm-缓存了-schema" aria-label="Permalink to &quot;10.3 删字段时 ORM 缓存了 schema&quot;">​</a></h3><p><strong>症状</strong>:DDL DROP COLUMN 完成,某些应用 pod 还在报&quot;column not found&quot;或反序列化失败。</p><p><strong>根因</strong>:<strong>ORM 启动时 introspect 了 schema 然后缓存</strong>——schema 改了 ORM 不知道,继续按老 schema 去 SELECT *。</p><p><strong>避坑</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 永远不要 SELECT *,显式列出列名</span></span>
<span class="line"><span>   - SELECT id, username, email FROM users</span></span>
<span class="line"><span>   - 这样 DROP 一个不引用的列对查询无影响</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. ORM 不缓存 schema:</span></span>
<span class="line"><span>   - SQLAlchemy 默认每次反射 schema,但 ORM 模型类是固定的</span></span>
<span class="line"><span>   - Django ORM 同理,model 定义即 schema 视图</span></span>
<span class="line"><span>   - 模型不引用要删的字段 = 删字段对模型透明</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 关键:任何字段从代码里&quot;消失&quot;前,必须先确认没有 SELECT * + ORM 缓存</span></span>
<span class="line"><span>   - 找一个测试 pod,手动 DESC TABLE 后再做删除</span></span></code></pre></div><h3 id="_10-4-回滚没有提前准备" tabindex="-1">10.4 回滚没有提前准备 <a class="header-anchor" href="#_10-4-回滚没有提前准备" aria-label="Permalink to &quot;10.4 回滚没有提前准备&quot;">​</a></h3><p><strong>症状</strong>:发布出问题决定 rollback,发现 schema 已经变了,rollback 不了。</p><p><strong>根因</strong>:<strong>做了不可逆的 schema 变更后才发现要回滚</strong>——比如 DROP COLUMN 后才发现新代码有 bug。</p><p><strong>避坑</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. Expand-Contract 的核心精神:不可逆的 Contract 永远是最后一步</span></span>
<span class="line"><span>2. 每次 DDL 提 PR 时,必须附带&quot;如何回滚&quot;:</span></span>
<span class="line"><span>   - ADD COLUMN → DROP COLUMN(无数据损失)</span></span>
<span class="line"><span>   - 重命名 → 反向重命名</span></span>
<span class="line"><span>   - DROP COLUMN → &quot;无法回滚,提交前请确认稳定 1 周&quot;</span></span>
<span class="line"><span>3. 永远不要&quot;今晚就 DROP&quot;,必须等&quot;代码稳定 + 完整观察期&quot;</span></span></code></pre></div><h3 id="_10-5-应用版本与-schema-不兼容-强约束失败" tabindex="-1">10.5 应用版本与 schema 不兼容(强约束失败) <a class="header-anchor" href="#_10-5-应用版本与-schema-不兼容-强约束失败" aria-label="Permalink to &quot;10.5 应用版本与 schema 不兼容(强约束失败)&quot;">​</a></h3><p><strong>症状</strong>:加了 NOT NULL 约束,但有老代码还在 INSERT 不填这列 → INSERT 失败。</p><p><strong>根因</strong>:<strong>没把&quot;代码停止写老字段&quot;作为&quot;添加 NOT NULL 约束&quot;的前置条件</strong>。</p><p><strong>避坑</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>NOT NULL 约束的正确添加序列:</span></span>
<span class="line"><span>  1. 加列 NULLable 默认值 X</span></span>
<span class="line"><span>  2. 回填历史数据,所有行该列都不是 NULL</span></span>
<span class="line"><span>  3. 部署代码:任何 INSERT / UPDATE 都填这列</span></span>
<span class="line"><span>  4. 等代码 100% 部署 + 观察 1 周</span></span>
<span class="line"><span>  5. 加 NOT NULL 约束(或 CHECK)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  反过来就是:</span></span>
<span class="line"><span>    没做 3-4 步就加 NOT NULL → 老代码 INSERT 失败</span></span></code></pre></div><h3 id="_10-6-双写时序错乱" tabindex="-1">10.6 双写时序错乱 <a class="header-anchor" href="#_10-6-双写时序错乱" aria-label="Permalink to &quot;10.6 双写时序错乱&quot;">​</a></h3><p><strong>症状</strong>:双写期间数据不一致,新旧字段对不上。</p><p><strong>根因</strong>:<strong>双写没用事务,或事务里有逻辑导致&quot;只写了一边&quot;</strong>。</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ✗ 错的:不在同一事务,可能写了一边失败另一边</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> confirm_email</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user_id, email):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> User.get(user_id)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user.email </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db.save(user)            </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># commit</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    user.email_verified </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> True</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db.save(user)            </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 另一个 commit</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 中间崩了 → 只有 email 改了,email_verified 没改</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ✓ 对的:同一事务</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> confirm_email</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user_id, email):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> db.transaction():</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        user </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> User.get(user_id)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        user.email </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> email</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        user.email_verified </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> True</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        db.save(user)        </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 一次 commit,要么都成功要么都失败</span></span></code></pre></div><p><strong>避坑</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 双写必须在同一事务里</span></span>
<span class="line"><span>2. 涉及多表的双写,要么所有表事务,要么用 outbox pattern</span></span>
<span class="line"><span>3. Cross-system 的双写(DB + 缓存 / DB + 搜索引擎):</span></span>
<span class="line"><span>   - 必须接受&quot;短暂不一致&quot;</span></span>
<span class="line"><span>   - 用异步任务保证最终一致</span></span>
<span class="line"><span>   - 不要试图在请求路径里做&quot;分布式事务&quot;,成本太高</span></span></code></pre></div><h3 id="_10-7-回填脚本一次-update-全表" tabindex="-1">10.7 回填脚本一次 UPDATE 全表 <a class="header-anchor" href="#_10-7-回填脚本一次-update-全表" aria-label="Permalink to &quot;10.7 回填脚本一次 UPDATE 全表&quot;">​</a></h3><p><strong>症状</strong>:跑回填脚本,主库 IO 跑满,从库延迟 30 分钟,主从同步差点中断,binlog 爆。</p><p><strong>根因</strong>:<strong>写了 &quot;UPDATE users SET ...&quot; 没加 LIMIT / 分批</strong>,8 亿行一次 UPDATE = 一次巨型事务 = 巨型 binlog event = 灾难。</p><p><strong>避坑</strong>(这条已经在 5.3 / Step 2 / 8.4 详谈):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>回填脚本的硬规则:</span></span>
<span class="line"><span>  1. 必须 LIMIT N(典型 1000-5000)</span></span>
<span class="line"><span>  2. 必须 checkpoint 续跑</span></span>
<span class="line"><span>  3. 必须 sleep 控制速率</span></span>
<span class="line"><span>  4. 必须监控复制延迟动态减速</span></span>
<span class="line"><span>  5. 必须监控 binlog 增长</span></span>
<span class="line"><span></span></span>
<span class="line"><span>代码层面:</span></span>
<span class="line"><span>  ✗ 不要写 &quot;UPDATE users SET email_verified = TRUE WHERE email &lt;&gt; &#39;&#39;&quot;</span></span>
<span class="line"><span>  ✓ 必须写 &quot;UPDATE users SET email_verified = TRUE </span></span>
<span class="line"><span>            WHERE id BETWEEN x AND x+1000 AND email &lt;&gt; &#39;&#39;&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>并且:</span></span>
<span class="line"><span>  - 跑之前在 staging 跑过完整流程</span></span>
<span class="line"><span>  - 估算 binlog 总量,确认备份系统能承受</span></span>
<span class="line"><span>  - 跑的时候 SRE 在场监控,不是&quot;丢上去就走&quot;</span></span></code></pre></div><hr><h2 id="十一、小结" tabindex="-1">十一、小结 <a class="header-anchor" href="#十一、小结" aria-label="Permalink to &quot;十一、小结&quot;">​</a></h2><ol><li><strong>数据库变更是发布工程的最大风险</strong>——代码可以 rollback,数据回不去</li><li><strong>&quot;蓝绿 schema 不存在&quot;</strong>——除了读多写少的字典表</li><li><strong>在线 DDL 工具</strong>:MySQL 8.0 INSTANT 能覆盖一部分 / 复杂场景用 gh-ost(无触发器、读 binlog、可暂停)/ PG 用 CONCURRENTLY + 分步骤</li><li><strong>Expand-Contract 是核心套路</strong>:Expand(加新结构)→ Migrate(回填 + 双写 + 切读)→ Contract(删旧结构)——<strong>每一步独立可回滚</strong></li><li><strong>完整例子(users.email)</strong>:5 步迁移让&quot;代码 / schema / 数据&quot;在任意时间点都兼容</li><li><strong>发布顺序的铁律</strong>:ADD 字段先 schema 后代码,DROP 字段先代码后 schema</li><li><strong>回填脚本三件套</strong>:幂等 + 断点续跑 + 控速,任何&quot;一次 UPDATE 全表&quot;都是炸弹</li><li><strong>超大表(&gt; 10 亿行)</strong>:分批 + sleep + 监控复制延迟 + 避开高峰</li><li><strong>ORM 工具</strong>:Liquibase / Flyway / Atlas / Goose / Alembic——选适合团队语言生态的,Atlas 的&quot;声明式 schema-as-code&quot;是现代潮流</li><li><strong>7 大坑</strong>:裸 ALTER 锁表 / 外键阻塞 / ORM schema 缓存 / 回滚没准备 / NOT NULL 与代码不同步 / 双写时序错乱 / 全表 UPDATE</li></ol><p><strong>最后一段写给所有还在用&quot;先把代码部署上去,改 schema 之后就好了&quot;的团队</strong>:</p><p>这条路 100 微服务规模下还能撑,1000 微服务规模下你团队会因为&quot;schema 部署事故&quot;每月翻一次车。<strong>Expand-Contract 不是高级技巧,是工程纪律</strong>——所有&quot;成熟&quot;的中大型团队最终都会走到这里,<strong>早走早受益</strong>。多花的那 1 周观察期,<strong>值你 5 次半夜事故的精力</strong>。</p><hr><h2 id="后记-这一层-18-23-的总结" tabindex="-1">后记:这一层(18-23)的总结 <a class="header-anchor" href="#后记-这一层-18-23-的总结" aria-label="Permalink to &quot;后记:这一层(18-23)的总结&quot;">​</a></h2><p>这一篇是&quot;发布工程&quot;层的最后一篇。回头看这 6 篇:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>18  CI/CD 心智              ── 把&quot;代码合上去 → 服务跑起来&quot;做成可重复管道</span></span>
<span class="line"><span>19  制品仓库与镜像供应链      ── 制品是发布的单位,签名 + SBOM 保供应链</span></span>
<span class="line"><span>20  GitOps 与 ArgoCD          ── 声明式发布,git 就是 source of truth</span></span>
<span class="line"><span>21  渐进发布(蓝绿/金丝雀)    ── 实例维度的灰度,把&quot;全量翻车&quot;压缩成&quot;1% 翻车&quot;</span></span>
<span class="line"><span>22  Feature Flag 工程         ── 启用维度的灰度,把&quot;deploy&quot;和&quot;release&quot;解耦</span></span>
<span class="line"><span>23  数据库变更与发布耦合      ── 数据有状态,所有无状态发布技巧都要在这里&quot;重新审视&quot;</span></span></code></pre></div><p><strong>这一层的硬指标</strong>:你团队的 <strong>Change Failure Rate</strong> 应该从 30% 降到 5% 以下,<strong>MTTR</strong>(发布相关事故的)应该从小时降到分钟。如果这两个指标没动,<strong>说明 6 篇里有的没真落地</strong>。</p><p>**下一层(24-27 IaC 与配置管理)**预告:发布解决了&quot;代码到服务&quot;,IaC 解决&quot;声明到基础设施&quot;——你的 K8s 集群、RDS 实例、负载均衡器从哪里来?手点 Console = 配置漂移 = 灾备恢复时全员蒙圈;Terraform 让你把基础设施变成可版本化、可 review、可回滚的代码——下一层就是把&quot;基础设施&quot;也纳入软件工程的方法论。</p><p>发布层就到这里。<strong>祝你团队从今天起再也不出&quot;凌晨 ALTER 锁表&quot;这种事故</strong>。</p>`,245)])])}const g=a(l,[["render",e]]);export{o as __pageData,g as default};
