# OWASP Top 10 2025:现代版重排、风险打分、怎么读这份清单

很多工程师对 OWASP Top 10 的第一印象是「**安全圈的十大金曲榜**」——隔几年发一次,前十位会换,大家拿来背一背、应付一下面试和合规审计。**这个看法是错的,而且错得很有代价**。OWASP Top 10 既不是「最严重的十个漏洞」,也不是「最常见的十类 bug」,**它是「全球安全行业对 Web 风险的一次结构化共识投票」**——选什么、不选什么、怎么排序,每一条背后都有数据 + 争议 + 行业偏好。**看懂了这份清单怎么"做出来",你才看得懂它"想让你做什么"**。

> 一句话先记住:**OWASP Top 10 ≠ 漏洞排行榜,而是「行业认知地图」**——它告诉你"现在大家普遍承认这十类风险值得专门投资源去防",**排名是"频率 + 可利用性 + 影响 + 行业感知"四个权重的加权结果**,所以**理解打分逻辑**比背名字重要 100 倍。**2021 版的最大变化是引入了"设计类风险"(A04)和"供应链类风险"(A08),2025 版预计会把 AI/Agent 滥用和 IaC 错配的权重再往上推**——这两条变化背后,是整个行业对"漏洞从哪儿来"的认知在迭代。

webLearning/35 用一节浅讲过 OWASP Top 10 的名字和一句话定义。**这一篇是深度版**——讲清楚这份清单是怎么投出来的、为什么这么排、2025 会怎么变、以及**怎么把它变成你团队上线前的硬性 checklist**。后面 10-15 篇会逐项展开 XSS、CSRF、注入、SSRF、反序列化、认证授权——**这篇是那 6 篇的总图,先看完这张图,后面每一篇才能放到正确的位置**。

---

## 一、OWASP Top 10 到底是什么

### 1.1 三个常见的误解

**误解 1:Top 10 = 最严重的 10 个漏洞**

不是。如果按"单次利用最严重",远程代码执行(RCE)、零日漏洞、内存破坏类才是天花板,**但它们从来没排在 OWASP Top 10 第一**。A01 Broken Access Control 排第一,**是因为它在"实际项目里出现得最普遍"**——大部分公司一抽查就能挑出权限错配,而 RCE 是少数。

**误解 2:Top 10 = 完整的 Web 安全清单**

也不是。Top 10 是**主动忽略**了很多"细分但重要"的类别——DoS、信息泄漏、缓存投毒、HTTP 走私、原型链污染——这些都没单列。**Top 10 是粗粒度的"风险大类"**,每一类下面再细分能拆出几十个子项。**真正完整的清单是 OWASP ASVS(Application Security Verification Standard),Top 10 只是 ASVS 的"科普版"**。

**误解 3:Top 10 是给开发者看的**

**只对了一半**。Top 10 真正的受众是**决策层**——CTO / CISO / 安全负责人——给他们一个"今年应该把预算投在哪儿"的共识。开发者直接看 Top 10 信息密度太低,**应该看 OWASP Cheat Sheet 系列或 ASVS**。但 Top 10 是**所有甲方安全评审、合规审计、招投标安全条款**的最低公约数,工程师必须懂它的语义。

### 1.2 OWASP Top 10 真正的定位

```
        粗 ←──────────────────────────────→ 细

   OWASP Top 10  →  OWASP ASVS  →  Cheat Sheet  →  CWE/CVE
   (行业共识)       (验证清单)      (具体修复)      (单个漏洞)
   
   决策层           安全工程师       开发工程师       挖洞 / 修复
```

**Top 10 的价值是"统一语义"**——当你跟另一个团队、另一家公司、另一国监管对话时,**说"A01 Broken Access Control"比说"权限校验缺失"省 5 分钟**。它是行业的「**Lingua Franca**」。

---

## 二、Top 10 是怎么"排"出来的

很多人以为 OWASP 每四年开个会拍脑袋定一次,**完全错了**。从 2017 版开始,**Top 10 是数据驱动 + 行业调研双轨制**——这个流程值得每个安全工程师都知道。

### 2.1 数据来源:8 + 2 模型

**2021 版的数据组成**:

```
8 个"漏洞类别":全部来自数据
   ├─ 数据贡献者:超过 40 家公司(扫描器厂商、SOC、bug bounty)
   ├─ 样本量:50 万+ 应用,40 万+ 漏洞
   └─ 评估指标:出现率、可利用性、可检测性、技术影响

2 个"行业调研类别":来自社区投票
   ├─ Top 10 调研问卷(开发者 / 安全研究员)
   └─ 弥补"数据看不到的新兴风险"
       例:Insecure Design、Software Integrity Failures
       —— 这两个在 2021 是"调研类"挤进来的
```

**关键设计**:**纯数据排序会"滞后两年"**——新型攻击没积累足够的 CVE 之前,数据看不见。所以 OWASP 留了 2 个"调研类"slot,**让行业可以提前预警**——2021 把"Insecure Design"和"Software Integrity Failures"放进来,**就是给供应链攻击和设计类风险铺路**。事后证明这个判断对了,SolarWinds、Log4Shell、xz-utils 全部落在这两类。

### 2.2 打分公式

```
Top 10 排序 = 加权(
    出现率 (Incidence Rate),
    可利用性 (Exploitability),
    可检测性 (Detectability),
    技术影响 (Technical Impact)
)
```

但**这四个权重不是固定的**。2017 版偏"出现率",所以 SQL 注入排第一(频率高)。2021 版改成偏"业务影响",**Broken Access Control 跃居第一**——它出现率没那么夸张,但**每一次都可能直接导致越权访问全库**。

> 这就是为什么 2021 版给人感觉"重排了"——**不是漏洞变了,是行业开始更看重影响而不是频率**。

### 2.3 一个被严重低估的事实

**OWASP Top 10 的数据集是有偏的**:

- 数据来自**愿意上报漏洞的公司**——绝大多数是欧美中大型企业
- 数据来自**已经做了扫描的应用**——本身就有安全意识的团队
- 数据**严重低估了内部业务系统、政务、IoT**——这些根本不在扫描器视野里

**所以 Top 10 反映的是"成熟 SaaS 生态的风险结构",不是"整个互联网的风险结构"**。如果你做 IoT、政务、工控,**直接照搬 Top 10 会漏掉一大半真实风险**。

---

## 三、2017 → 2021 → 2025 三代演变

### 3.1 三代对比表

| 排名 | 2017 | 2021 | 2025(预期) |
| --- | --- | --- | --- |
| A01 | Injection | **Broken Access Control** ↑ | Broken Access Control |
| A02 | Broken Authentication | Cryptographic Failures(原 Sensitive Data) | Cryptographic Failures |
| A03 | Sensitive Data Exposure | **Injection**(含 XSS)↓ | Injection |
| A04 | XXE | **Insecure Design**(新)★ | Insecure Design |
| A05 | Broken Access Control | Security Misconfiguration | Security Misconfiguration |
| A06 | Misconfiguration | **Vulnerable Components** ↑ | **Supply Chain Failures**(并入) |
| A07 | XSS(合并入 Injection) | Identification & Auth Failures | Identification & Auth Failures |
| A08 | Insecure Deserialization | **Software & Data Integrity**(新)★ | Software & Data Integrity |
| A09 | Vulnerable Components | Security Logging & Monitoring Failures | **Logging / Detection Failures**(细化) |
| A10 | Insufficient Logging | **SSRF**(新)★ | SSRF / **AI & Agent Misuse**(预期) |

> 加粗 = 当年新增或位次大幅变动。★ = 通过"调研类"塞进来的"预警型"类别。

### 3.2 2021 版的三个关键判断

**判断 1:Broken Access Control 排第一**

权限校验是一个**纯业务逻辑问题**,框架管不到,SAST 扫不出,只能靠 code review。**所以它在每个项目都会出现,而且每次出现都是"越权全库"级影响**。OWASP 把它从 A05 抬到 A01,**就是承认"今天 Web 安全的最大问题已经不是注入,而是业务逻辑"**。

**判断 2:Injection 合并 XSS,降到 A03**

XSS 在 2017 之前一直独立排名。**但现代框架(React / Vue / Angular)默认转义**,XSS 的"出现率"大幅下降。同时 SQL 注入因为 ORM 普及,**也没那么常见了**。所以 OWASP 把它俩**合并成"注入"大类**,统一降级。

**判断 3:新增三个"调研类"前瞻类别**

- **A04 Insecure Design**:承认"很多漏洞不是 bug,是设计就错了"——比如忘记设计速率限制、忘了考虑滥用场景
- **A08 Software & Data Integrity**:承认"供应链攻击是新常态"——SolarWinds 之后必须有这一类
- **A10 SSRF**:承认"云时代 SSRF 危害指数级放大"——一旦打到云元数据接口直接接管账号

### 3.3 2025 预期:三条演化主轴

OWASP 在 2025 还没正式发布 Top 10(撰文时为 2026 年 5 月,2025 版征求意见已开始),**但行业共识相当一致**,大致三个方向:

**主轴 1:供应链类别会"扩容"**

A06 Vulnerable Components + A08 Software & Data Integrity 很可能**合并或并列**成"**Supply Chain Failures**"。理由:Log4Shell、xz-utils、npm 投毒、PyPI typo-squat、CI/CD 凭据泄漏——**这些事件用"组件漏洞"和"完整性"两个标签分开讲,已经分不清**。

**主轴 2:AI / LLM / Agent 滥用进入清单**

OWASP 已经发布了独立的 **OWASP Top 10 for LLM Applications**(LLM01-10),覆盖 Prompt 注入、训练数据投毒、过度代理(Excessive Agency)、不安全的输出处理等。**2025 主榜会不会"挤进"一个 AI 类别**还在争论中——**乐观估计是 A10 位置出现 "Insecure LLM Integration" 或 "AI/Agent Misuse"**。

**主轴 3:Misconfiguration 会"细化"**

A05 Security Misconfiguration 在云原生时代爆炸——K8s YAML 错配、IAM 策略过宽、S3 bucket 公开、Terraform 默认值——OWASP 2025 可能把它拆出独立的"**IaC / Cloud Misconfiguration**"类别。

> 这三条主轴的共性是:**Web 安全的边界在外扩**。原来 Top 10 只盯应用代码,现在不得不盯**代码以外的东西**——依赖、CI、模型、配置。**安全工程师的工作范围在过去 5 年扩了 3 倍**,Top 10 的演化只是这个事实的镜像。

---

## 四、2021 版逐项总览(深度版)

> 这一节**只讲是什么、为什么排在这里、踩坑提示**——细节展开看 10-15 篇。

### A01 Broken Access Control —— 业务逻辑的永恒之痛

「**用户 A 能不能访问用户 B 的资源?**」**听起来很简单,十年都没修完**。常见姿势:URL 直接拿 ID 改一下就越权(IDOR)、API 缺少角色检查、JWT claims 信任客户端、admin 接口忘了加白名单。

为什么最难修:**框架管不到**——Spring Security / Express middleware 只能管"是不是登录了",**管不到"这个用户能不能动这条数据"**。**这条永远是 code review 的重头戏**。后续 15 篇展开 JWT 攻击和 OAuth 流程缺陷。

### A02 Cryptographic Failures —— 不是"破解",是"用错"

**很少有人能真"破解 AES"**——但**几乎所有公司都"用错了密码学"**:用 MD5 存密码、用 ECB 模式加密、用同一个 IV 加密两条消息、私钥写在代码里、TLS 强制最低版本只到 1.0。

OWASP 2021 把它从"Sensitive Data Exposure"改名为"Cryptographic Failures",**就是想纠正"敏感数据问题 = 加密问题"的错觉**——大部分时候不是没加密,**是加密用错了**。后续 04-08 篇密码学层全部展开。

### A03 Injection(含 XSS)—— 经典战场,远未结束

注入家族:SQL / NoSQL / LDAP / OS Command / Template / Expression Language / XSS / Header / Log。**共同模式**:用户输入直接进了"解释器上下文",**没经过结构化的转义或参数化**。

ORM 让 SQL 注入"看上去消失了",**但模板注入和原生 SQL 拼接仍然在很多老代码里**。XSS 在现代框架里少见,**但 DOM XSS 和 mutation XSS 还在大量出现**——React 不是万能的。后续 10、12 篇深入。

### A04 Insecure Design —— 不是 bug,是设计就错了

**Top 10 历史上第一个"非漏洞"类别**——它说的不是"代码哪里有问题",**而是"这功能从一开始就没有考虑滥用场景"**。

经典例子:登录接口没有速率限制(被撞库)、注册接口允许任意邮箱(被批量注册)、找回密码用"妈妈姓什么"(社工答案)、点单系统允许负数(被刷信用)。**这类问题不能靠扫描器发现,只能靠"威胁建模"(02 篇)**。Top 10 把它纳入,**就是要逼大家"在设计阶段就想滥用场景"**。

### A05 Security Misconfiguration —— 云原生时代最"贵"的错

「**默认配置 + 你忘了改**」=「**线上事故**」。例:S3 bucket 默认公开、ElasticSearch 默认无认证、K8s API Server 暴露公网、debug 模式上线、不必要的 HTTP 方法开着、CORS 配置成 `*`。

**这一类的特点是"扫描器最容易找,但你最容易忽略"**——因为它不在代码里,**在 YAML、Terraform、Helm Chart、IAM 策略里**。后续 28 篇容器与云安全展开。

### A06 Vulnerable & Outdated Components —— 依赖即漏洞

**你的应用 = 你的代码 + 1000 个依赖的代码**。Log4Shell 一夜震惊全球,**就是因为大家都不知道自己引了 log4j-core**。

防御不是"不用依赖",而是**"知道你用了什么 + 持续更新 + 自动告警"**——SBOM、Dependabot、Snyk、OSV 这些工具的整个产业链都是为这一类服务的。**2025 这一类很可能并入"供应链失败"大类**。

### A07 Identification & Authentication Failures —— 不只是登录

**改名很关键**:2017 叫"Broken Authentication",2021 改为"Identification and Authentication Failures",**新增了"Identification"**——**不只是"你是不是登录了",还包括"系统怎么识别你是谁"**。

涵盖:弱密码、撞库、会话固定、JWT 算法 none 绕过、refresh token 不轮换、忘记密码流程被劫持、多设备登录无监控、SSO 配错域名。**OAuth / OIDC 流程缺陷也在这里**——15 篇展开。

### A08 Software & Data Integrity Failures —— 供应链浮现的标志

**这是 2021 Top 10 最重要的新增**——承认「**你信任的代码 / 数据 / 更新流可能被篡改**」。

涵盖:CI/CD 流水线被入侵、依赖被替换、自动更新流被劫持(SolarWinds)、反序列化不可信数据、签名校验缺失。**反序列化漏洞从独立类别(2017 A08)被并入这里**——它本质上就是"信任了不可信的数据"。后续 14、26 篇深入。

### A09 Security Logging & Monitoring Failures —— 没日志 = 没事故响应

**前面九条都假设你"防得住",这条假设你"防不住"**——既然总会被打,**你能不能在 3 天内发现?能不能溯源?能不能定责?**

OWASP 把这一类放进来,**就是为了把"安全运营"也纳入工程师视野**——不是只写防御代码,**还要写"能被监控的代码"**:关键操作打 audit log、登录失败要计数、异常 IP 要告警、日志要不可改、保留期合规。

### A10 SSRF —— 云时代的"过山车"

服务端发起请求,**目标 URL 来自用户输入**——这个模式在云之前危害有限,**云之后是核弹**。一旦能打到 `http://169.254.169.254/latest/meta-data/`(AWS / GCP / Azure 元数据接口),**直接拿到 IAM 凭据接管账号**。

**Capital One 2019 年 1 亿用户泄漏就是这条**——一个 SSRF 接管了 EC2 IAM 角色,**整个账号沦陷**。后续 13 篇 SSRF 与 XXE 深入。

---

## 五、把 Top 10 变成"代码评审 checklist"

工程师视角的"读 OWASP"应该是这样的——**每一类对应几个具体的 review 动作**:

| 类别 | Code Review 要找什么 |
| --- | --- |
| A01 越权 | 所有 `findById(id)` 是否校验 owner;admin 接口是否额外角色检查;前后端权限是否对齐 |
| A02 密码学 | 是否还有 MD5/SHA1 用于密码;是否硬编码密钥;TLS 版本是否 ≥ 1.2;JWT 算法是否限定 |
| A03 注入 | 所有 SQL 是否参数化;模板渲染是否启用 auto-escape;`exec` / `system` 调用的输入来源 |
| A04 设计 | 关键操作是否有速率限制;是否考虑了"恶意用户"场景;业务流是否有撤销/审计 |
| A05 错配 | debug 是否关;CORS / CSP / HSTS / X-Frame 是否配;S3 / DB 是否暴露 |
| A06 依赖 | `package-lock` / `requirements.txt` 是否锁版本;CI 是否跑漏洞扫描 |
| A07 认证 | 登录是否限速;会话 token 是否在登录后轮换;JWT 是否禁了 `alg: none` |
| A08 完整性 | 反序列化的输入来源;CI 是否签名;依赖是否校验 hash |
| A09 日志 | 关键路径是否打 audit log;日志是否含敏感信息;告警是否真有人看 |
| A10 SSRF | 任何"用户给 URL 然后服务端去请求"的接口;是否限制内网 IP;是否禁 metadata IP |

> **建议把这张表打印贴在 review 工位上**——比"review 自由发挥"质量稳定 10 倍。

---

## 六、排名背后的争议

### 6.1 频率 vs 严重性

**OWASP 长期被批评"重频率轻严重性"**——你 100 个低危越权 + 1 个 RCE,按"出现率"排,越权赢。但**真实生产事故的 80% 损失来自那 1 个 RCE**。

这个争议没有标准答案,**OWASP 的折中是"在打分时把'技术影响'也纳入加权"**——但权重永远是主观的。所以**看 Top 10 排名时记住一条:排名 ≈ 行业资源应该投在哪儿,不等于单个事故的严重性**。

### 6.2 调研类的主观性

A04、A08、A10 是 2021 通过调研类投票塞进来的——**但调研问卷的回收对象本身就是"已经在做安全的人"**,这群人的偏好不能代表整个行业。

**真实风险可能比清单更分散**——但 OWASP 不得不"砍到 10 个",**这是工程上的妥协**。所以**Top 10 不是"最重要的 10 个",是"妥协后能在一页纸上讲完的 10 个"**。

### 6.3 一个永远的盲区:业务逻辑漏洞

**业务逻辑漏洞**——比如电商优惠券能叠加成 99% 折扣、提款接口能填负数转账、积分系统能撞库刷分——**OWASP 永远没法完整覆盖**。

A04 Insecure Design 只是个起点,**但业务逻辑漏洞本质上"每个应用一种",无法标准化**。**所以越成熟的团队,越不只看 OWASP,会自己维护一份"业务安全清单"**。

---

## 七、怎么读 2025 即将的更新

写到这里,2026 年 5 月,OWASP 2025 还在征求意见阶段。**但从已经公开的草稿、行业事件、相关 OWASP 项目演化看,有四条几乎确定的趋势**:

### 7.1 供应链相关权重大概率合并上升

A06 + A08 合并成"Supply Chain Failures"的呼声很高。**SBOM、Sigstore、SLSA 这套工具链已经从"安全圈内部"扩散到 CI/CD 主流**——GitHub Actions 强制提交者认证、PyPI 引入 2FA、npm 上线 provenance。**这一类从"调研类"变成"数据驱动类"已经只是时间问题**。

### 7.2 AI / LLM / Agent 进入主榜可能性极高

OWASP 的 LLM Top 10 已经迭代到第二版,**与主榜整合的呼声很大**。**至少会出现一个新类别**(预测在 A10 位置),覆盖:

- Prompt 注入(包括间接 Prompt 注入)
- Agent 过度代理(Excessive Agency)—— Agent 拿到了不该有的工具权限
- LLM 输出注入(把模型输出直接渲染到前端或喂给 exec)
- 训练数据 / 微调数据投毒
- 模型供应链(模型本身就来自不可信源)

> 这一类的细节后续 30 篇展开。**但从 Top 10 排名层面**,你需要知道:**只要你接了 LLM,你就必须把 LLM 输入当 SQL 注入级别的敌意输入对待**。

### 7.3 IaC / Cloud 配置类可能独立

K8s YAML、Terraform、Helm、CloudFormation、IAM 策略——**这些"非代码"的配置文件**已经成为攻击面的主战场。**2025 很可能从 A05 Security Misconfiguration 里**拆出一个"Insecure Cloud / IaC Configuration"独立类别。

### 7.4 业务逻辑 + Identity 仍然稳居前三

**Broken Access Control 和 Authentication Failures 在可见的未来都不会下来**——因为它们是"业务复杂度爆炸"的必然产物。**SaaS 越复杂、租户越多、权限模型越精细,这两条越严重**。

---

## 八、上线前 OWASP 自检表(完整版)

**把这张表当 PR 模板的一部分**——每条要么"已确认",要么"明确不适用",**不允许"我没想过"**。

### 8.1 访问控制(A01)

- [ ] 所有需要 owner 的资源接口,都校验了"当前用户是否是 owner"
- [ ] 所有 admin / internal 接口都加了独立的角色 / IP 白名单校验
- [ ] 前端隐藏的按钮,后端也校验了对应权限(不只靠前端)
- [ ] 所有 ID 是否使用"非顺序"(UUID / Snowflake),减少 IDOR 暴力面
- [ ] 多租户应用:**每个查询都带 tenant_id WHERE**,不是靠 Spring filter 自动注入
- [ ] 关键操作(改密码 / 转账 / 删数据)有二次确认或 step-up auth

### 8.2 密码学(A02)

- [ ] 密码存储用 Argon2id / bcrypt / scrypt,**不是 MD5/SHA1/SHA256+salt**
- [ ] 所有对称加密用 AES-GCM 或 ChaCha20-Poly1305,**不是 ECB/CBC 无 MAC**
- [ ] JWT 算法 server 端硬编码,**禁止从 header 读 `alg`**
- [ ] TLS 最低版本 1.2,**禁用 RC4 / 3DES / 旧 cipher suite**
- [ ] 密钥不在代码 / 配置 / 日志,统一走 KMS / Vault / Secrets Manager
- [ ] 敏感字段(身份证 / 手机)入库前哈希或加密,**不要明文**

### 8.3 注入(A03)

- [ ] 所有 SQL 用参数化 / ORM,**禁止字符串拼接(包括"我相信这里安全")**
- [ ] 模板引擎默认 auto-escape 开启;手动 `raw` / `unsafe` 输出有专项 review
- [ ] 所有 `exec` / `system` / `Runtime.exec` 调用,输入来源 100% 可信
- [ ] React `dangerouslySetInnerHTML` / Vue `v-html` 的使用全部走 sanitize
- [ ] 反序列化(JSON 之外)的输入来源 100% 可信,或走白名单
- [ ] 日志注入:用户输入打到日志前过滤换行符

### 8.4 设计(A04)

- [ ] 登录 / 注册 / 找回密码 / 验证码都有速率限制(per-IP + per-account)
- [ ] 关键业务流(下单 / 提现 / 充值)考虑过"恶意大量调用"场景
- [ ] 数值类输入(金额 / 数量 / 折扣)校验范围,**禁止负数 / 整数溢出**
- [ ] 优惠 / 积分 / 返现类逻辑过了"威胁建模"(02 篇)
- [ ] 系统有"撤销 / 回滚 / 审计 / 兜底报警"四件套之一

### 8.5 配置(A05)

- [ ] 生产环境 debug / stack trace 关闭
- [ ] CORS 配置具体 origin,**不是 `*`**
- [ ] 安全 header 完整:CSP / HSTS / X-Frame-Options / X-Content-Type-Options
- [ ] 默认账号密码全改,默认端口能改的改
- [ ] S3 / OSS / COS bucket 默认私有,公开的有专项 review
- [ ] K8s / Docker 不以 root 运行,readOnlyRootFilesystem 打开
- [ ] IAM 策略最小权限,**没有 `*:*`**

### 8.6 依赖(A06)

- [ ] CI 跑 Snyk / Dependabot / Trivy / OSV,有阻断阈值
- [ ] lockfile 提交,**不只是 package.json**
- [ ] 关键依赖订阅 CVE 邮件
- [ ] 有 SBOM 产物,至少能回答"我们用了哪个版本的 log4j / lodash / openssl"

### 8.7 认证(A07)

- [ ] 登录失败有计数 + 锁定 / 验证码 / 延迟
- [ ] 登录成功后 session ID / JWT 立即轮换
- [ ] refresh token 一次性,**每次刷新都换新**
- [ ] 找回密码用一次性 token,**不是答秘密问题**
- [ ] 关键操作 step-up auth(短信 / TOTP / WebAuthn)
- [ ] OAuth redirect_uri 严格匹配,**禁通配**

### 8.8 完整性(A08)

- [ ] CI/CD 凭据走 OIDC / 短期凭据,**不长期 token**
- [ ] 反序列化输入来源 100% 可信(或走白名单 / 签名校验)
- [ ] 关键二进制 / Docker image 签名(Cosign / Sigstore)
- [ ] 自动更新流有签名校验(避免 SolarWinds 重演)

### 8.9 日志监控(A09)

- [ ] 登录 / 越权 / 关键操作打 audit log
- [ ] 日志**不含**密码 / token / 身份证 / 卡号
- [ ] 日志集中、不可篡改、保留期合规(等保 / GDPR / SOC2)
- [ ] 异常告警**有真人值班**,不是发到没人看的群

### 8.10 SSRF(A10)

- [ ] 所有"用户给 URL,服务端去请求"的接口走白名单
- [ ] 禁止访问 `127.0.0.0/8`、`10.0.0.0/8`、`169.254.169.254` 等内网 / 元数据
- [ ] 跟随重定向时也校验目标(很多 SSRF 漏洞就在这里)
- [ ] 出网走单独 egress proxy,**不是直接 NAT**

---

## 九、看 OWASP 的"正确姿势"

写到这里给一个总结——**怎么把 OWASP Top 10 真正用好**:

### 9.1 三种用错的姿势

```
姿势 A:背名字背一遍,面试当 buff
   → 0 价值,过两个月忘光
姿势 B:逐项找一遍工具扫一遍,发布前过 checklist
   → 60 分,只覆盖了"已知模式"
姿势 C:把 Top 10 当作"威胁建模的入口",每一类去问"我系统在这一类的暴露面有多大"
   → 90 分,能找到真实风险
```

### 9.2 真正的进阶路径

```
1. 看 Top 10 的"是什么":本篇 + webLearning/35
2. 看每一类的"漏洞链 + 修复"细节:后续 10-15 篇
3. 看 OWASP ASVS 做完整自检:Level 1 / 2 / 3
4. 把团队的"自检表"沉淀下来,每个 PR 跑一遍
5. 把"业务安全清单"补上 Top 10 之外的盲区
```

### 9.3 一个反直觉的事实

**很多优秀的安全工程师不依赖 Top 10**——他们依赖**威胁建模**(02 篇)。

威胁建模 = 「**这个系统有哪些资产 / 信任边界 / 攻击面 / 滥用场景**」,**Top 10 是其中"通用类风险"的 checklist**。**威胁建模做得好的团队,Top 10 自然就覆盖了**;反过来,**只过 Top 10 而不做威胁建模的团队,永远漏业务逻辑漏洞**。

> 这就是为什么本系列 02 篇直接讲威胁建模,**而不是先讲 Top 10**——Top 10 是"地图",威胁建模才是"指南针"。

---

## 十、踩坑提醒

1. **以为 Top 10 = 全部 Web 风险**——它是粗粒度大类,真清单是 ASVS
2. **以为排名 = 严重性**——排名是"频率 + 影响 + 行业感知"的混合,不是单事故严重性
3. **以为 Top 10 永远适用**——它对 Web 应用准,对 IoT / 工控 / 政务系统盲区大
4. **以为扫描器能覆盖 Top 10**——A01、A04、A09 几乎扫不出来,只能 review + 设计
5. **以为新版 = 完全推翻旧版**——Top 10 演化非常保守,**前 5 名 5 年不变**
6. **以为 2017 老版本可以丢**——很多公司的合规审计还在用 2017,你写文档时要注明版本
7. **以为合规 = 安全**——通过 Top 10 不等于真安全,这是底线不是目标
8. **以为 Top 10 跟 LLM 应用无关**——2025 大概率新增 AI 类别,提前准备
9. **以为依赖问题不严重**——A06 + A08 合起来覆盖了过去 5 年最大的几次行业事故
10. **以为没出事就是没问题**——A09 提醒你:**你没监控,就只是不知道而已**

---

下一篇:`10-XSS全攻略.md`,从最经典的反射型/存储型 XSS 出发,讲清楚为什么 React 默认转义之后还是会出 DOM XSS,**Mutation XSS** 是怎么钻 HTML 解析器和 sanitizer 的对齐差异的,**CSP** 怎么从「nonce / strict-dynamic / 报告模式」三段式落地,以及为什么 Google / GitHub 转向 **Trusted Types** 把"危险 sink"从运行时变成编译时检查——一旦理解了 XSS 的"现代防线",你才会发现「`innerHTML` 等于自杀」**不再是夸张**,而是底线。
