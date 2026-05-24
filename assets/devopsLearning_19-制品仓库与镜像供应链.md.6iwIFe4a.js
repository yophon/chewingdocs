import{c as a,Q as n,j as i,m as p}from"./chunks/framework.Bhbi9jCp.js";const g=JSON.parse('{"title":"制品仓库与镜像供应链:Harbor / 镜像签名 / SBOM / Cosign","description":"","frontmatter":{},"headers":[],"relativePath":"devopsLearning/19-制品仓库与镜像供应链.md","filePath":"devopsLearning/19-制品仓库与镜像供应链.md","lastUpdated":1778496697000}'),l={name:"devopsLearning/19-制品仓库与镜像供应链.md"};function e(t,s,r,h,o,k){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="制品仓库与镜像供应链-harbor-镜像签名-sbom-cosign" tabindex="-1">制品仓库与镜像供应链:Harbor / 镜像签名 / SBOM / Cosign <a class="header-anchor" href="#制品仓库与镜像供应链-harbor-镜像签名-sbom-cosign" aria-label="Permalink to &quot;制品仓库与镜像供应链:Harbor / 镜像签名 / SBOM / Cosign&quot;">​</a></h1><p>上一篇 18 讲了 CI 心智——产出的&quot;镜像&quot;是 CI 的最终交付物。<strong>但这个镜像从被推到 registry,到在 K8s 集群里被拉起来跑,中间经过的环节比大多数人想象的要多得多</strong>。SolarWinds、codecov、xz-utils 这些供应链事件提醒我们:<strong>「镜像」不是一个可以无脑信任的二进制</strong>,registry 可能被入侵、CI 可能被劫持、第三方 base image 可能埋伏后门、<code>docker pull</code> 拉到的可能根本不是你期望的镜像。</p><p>securityLearning/26 整体讲了供应链安全的横切问题——<strong>这一篇只讲镜像这一维</strong>:一个 Java / Go 镜像从构建到生产,这条链路上有哪些环节、每一环可以装什么&quot;门禁&quot;、为什么 cosign 签名 + SBOM + 镜像扫描 是中型团队的标配三件套、为什么&quot;内网镜像源&quot;不是供应链安全的银弹。</p><blockquote><p>一句话先记住:<strong>镜像供应链的核心问题不是&quot;我会不会构建出有漏洞的镜像&quot;,是&quot;集群里跑的镜像到底是不是我构建的那个&quot;</strong>。CVE 扫描只解决前者,<strong>签名 + 准入控制才解决后者</strong>。中型团队 80% 的供应链事故,根因都是后一类——CI/CD 流水线本身被劫持,或者 image tag 漂移导致 prod 实际跑了一个&quot;长得很像但其实不是&quot;的镜像。<strong>这一篇所有的工程取舍都围绕&quot;prod 里跑的就是 CI 出来的那个 hash&quot;这一条不变量展开</strong>。</p></blockquote><hr><h2 id="一、制品仓库-不只是-镜像放哪里-那么简单" tabindex="-1">一、制品仓库:不只是&quot;镜像放哪里&quot;那么简单 <a class="header-anchor" href="#一、制品仓库-不只是-镜像放哪里-那么简单" aria-label="Permalink to &quot;一、制品仓库:不只是&quot;镜像放哪里&quot;那么简单&quot;">​</a></h2><p>中型团队第一次思考制品仓库时,问的问题通常是:&quot;我们买 Harbor 还是 JFrog?&quot;——这是把问题问小了。<strong>制品仓库要管的不只是镜像</strong>,还有 Helm Chart / npm 包 / Maven 包 / Python wheel / Go module / 二进制 release / Terraform module / Charts。这些都是&quot;制品&quot;,都需要版本化 + 权限 + 审计。</p><h3 id="_1-1-制品的三大类" tabindex="-1">1.1 制品的三大类 <a class="header-anchor" href="#_1-1-制品的三大类" aria-label="Permalink to &quot;1.1 制品的三大类&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                          制品的三大类                                            │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>│  类别            典型物              主流仓库                                    │</span></span>
<span class="line"><span>│  ──────────────────────────────────────────────────────────────────────────    │</span></span>
<span class="line"><span>│  容器镜像        Docker / OCI image  Harbor / JFrog / Nexus / ECR / GAR / ACR  │</span></span>
<span class="line"><span>│                  Helm Chart          (OCI 格式,跟镜像一个仓库)                 │</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>│  语言包          npm package         npm 私服 / Verdaccio / JFrog              │</span></span>
<span class="line"><span>│                  Maven JAR           Nexus / JFrog / Artifactory              │</span></span>
<span class="line"><span>│                  Python wheel        Devpi / PyPI 私服 / JFrog                │</span></span>
<span class="line"><span>│                  Go module           Athens / JFrog                           │</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>│  二进制制品       打包好的 tar / 安装包  GitHub Releases / Artifactory / S3     │</span></span>
<span class="line"><span>│                  AMI / VM 镜像        云厂自带 (AWS AMI / GCP image)           │</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>中型团队的现实</strong>:<strong>不同类型的制品在不同仓库</strong>——很正常,也是常态。镜像放 Harbor,Java 包放 Nexus,Python 包放公司私服,前端 npm 包放 Verdaccio。<strong>JFrog 是把这些统一在一起的方案</strong>,但价格不便宜。</p><h3 id="_1-2-镜像仓库的五个选项" tabindex="-1">1.2 镜像仓库的五个选项 <a class="header-anchor" href="#_1-2-镜像仓库的五个选项" aria-label="Permalink to &quot;1.2 镜像仓库的五个选项&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Harbor (CNCF):</span></span>
<span class="line"><span>  + 开源,自建可控,K8s 原生</span></span>
<span class="line"><span>  + 多项目 + RBAC + 复制 + Trivy 内置 + cosign 签名 + 漏扫策略</span></span>
<span class="line"><span>  + 国内文档好,生态成熟</span></span>
<span class="line"><span>  - 自建运维成本(HA / 备份 / 升级)</span></span>
<span class="line"><span>  - 大规模(&gt; 100TB)时性能要调优</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>JFrog Artifactory:</span></span>
<span class="line"><span>  + 商业级,什么制品都能存</span></span>
<span class="line"><span>  + Xray 漏洞扫描 + Distribution + Pipelines</span></span>
<span class="line"><span>  + 跨地域复制企业级</span></span>
<span class="line"><span>  - 商业 license $$$,功能买不齐</span></span>
<span class="line"><span>  - 配置复杂,UI 凌乱</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Nexus:</span></span>
<span class="line"><span>  + 开源(Community)+ 商业(Pro)</span></span>
<span class="line"><span>  + Java 生态(Maven)历史最强</span></span>
<span class="line"><span>  + Docker 镜像支持但不如 Harbor 专业</span></span>
<span class="line"><span>  - Docker 维度功能少,扫描需要插件</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>AWS ECR / GCP GAR / Azure ACR:</span></span>
<span class="line"><span>  + 云原生,IAM 集成,扩缩容免维护</span></span>
<span class="line"><span>  + 自动漏洞扫描(基础免费,深度付费)</span></span>
<span class="line"><span>  - 跟云厂深度绑定</span></span>
<span class="line"><span>  - 跨云 / 混合云时不灵活</span></span>
<span class="line"><span>  - 出口流量费贵</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Docker Hub / Quay.io 公有:</span></span>
<span class="line"><span>  + 公开镜像免费托管</span></span>
<span class="line"><span>  - 速率限制(Docker Hub anonymous 100/6h)</span></span>
<span class="line"><span>  - 公司私有镜像不放公网,自己买专属空间贵</span></span></code></pre></div><h3 id="_1-3-选型决策" tabindex="-1">1.3 选型决策 <a class="header-anchor" href="#_1-3-选型决策" aria-label="Permalink to &quot;1.3 选型决策&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队 / 场景                            推荐</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>全 AWS,K8s 在 EKS,简单需求           ECR(免运维,IAM 集成)</span></span>
<span class="line"><span>全 GCP,K8s 在 GKE,简单需求           GAR</span></span>
<span class="line"><span>中型团队,自建 K8s,多云                Harbor(本系列默认)</span></span>
<span class="line"><span>大型企业,混合制品,预算充足            JFrog Artifactory</span></span>
<span class="line"><span>团队 &lt; 5 人,只发 10 个服务            Docker Hub 私有库就够</span></span>
<span class="line"><span>中后端 Java 主力                       Nexus + Harbor(Java 包 + 镜像分开)</span></span></code></pre></div><p><strong>我推荐</strong>:<strong>中型团队从 Harbor 起步</strong>——它是 CNCF 项目,跟 K8s 同生态,功能够用,自建可控,后面要加签名 / 扫描 / 复制都是内置的。<strong>不要一上来就 JFrog</strong>,功能买齐贵且复杂。</p><hr><h2 id="二、harbor-架构-一个能扛-5000-qps-的镜像仓库长什么样" tabindex="-1">二、Harbor 架构:一个能扛 5000 QPS 的镜像仓库长什么样 <a class="header-anchor" href="#二、harbor-架构-一个能扛-5000-qps-的镜像仓库长什么样" aria-label="Permalink to &quot;二、Harbor 架构:一个能扛 5000 QPS 的镜像仓库长什么样&quot;">​</a></h2><h3 id="_2-1-harbor-核心组件" tabindex="-1">2.1 Harbor 核心组件 <a class="header-anchor" href="#_2-1-harbor-核心组件" aria-label="Permalink to &quot;2.1 Harbor 核心组件&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                 ┌─────────────────────────────────────┐</span></span>
<span class="line"><span>                 │  Harbor                              │</span></span>
<span class="line"><span>                 │                                      │</span></span>
<span class="line"><span>                 │   ┌─────────────┐  ┌──────────────┐  │</span></span>
<span class="line"><span>   docker        │   │  Portal     │  │  Core        │  │</span></span>
<span class="line"><span>   push / pull ──┼──▶│  (UI)       │──│  API / RBAC  │  │</span></span>
<span class="line"><span>                 │   └─────────────┘  └──────┬───────┘  │</span></span>
<span class="line"><span>                 │                            │          │</span></span>
<span class="line"><span>                 │    ┌───────────────────────┼─────┐   │</span></span>
<span class="line"><span>                 │    ▼                       ▼     │   │</span></span>
<span class="line"><span>                 │  ┌──────────┐  ┌──────────────┐  │   │</span></span>
<span class="line"><span>                 │  │ Registry │  │ JobService    │  │   │</span></span>
<span class="line"><span>                 │  │ (V2 API) │  │ (扫描/复制/GC) │  │   │</span></span>
<span class="line"><span>                 │  └────┬─────┘  └───────┬───────┘  │   │</span></span>
<span class="line"><span>                 │       │                │           │   │</span></span>
<span class="line"><span>                 │       ▼                ▼           │   │</span></span>
<span class="line"><span>                 │  ┌──────────┐  ┌──────────────┐   │   │</span></span>
<span class="line"><span>                 │  │ Storage  │  │ Trivy / clair│   │   │</span></span>
<span class="line"><span>                 │  │ S3/OSS/FS│  │ (CVE 扫描)   │   │   │</span></span>
<span class="line"><span>                 │  └──────────┘  └──────────────┘   │   │</span></span>
<span class="line"><span>                 │                                    │   │</span></span>
<span class="line"><span>                 │  ┌──────────────────────────────┐ │   │</span></span>
<span class="line"><span>                 │  │ PostgreSQL(元数据)          │ │   │</span></span>
<span class="line"><span>                 │  │ Redis(JobService 队列)      │ │   │</span></span>
<span class="line"><span>                 │  └──────────────────────────────┘ │   │</span></span>
<span class="line"><span>                 └────────────────────────────────────┘</span></span></code></pre></div><p><strong>关键概念</strong>:</p><ul><li><strong>Project</strong>(项目):权限隔离的最小单元,<strong>多团队共用一个 Harbor 必须分 Project</strong></li><li><strong>Repository</strong>:项目下的具体仓库,如 <code>myteam/orders-service</code></li><li><strong>Artifact</strong>:仓库下的一个镜像 / Helm Chart / Cosign 签名(都是 OCI 格式)</li><li><strong>Tag</strong> vs <strong>Digest</strong>:tag 可变,digest(<code>sha256:...</code>)不变,<strong>生产引用必须用 digest</strong></li><li><strong>复制策略</strong>(Replication):跨 Harbor 同步镜像,<strong>多机房 / DR 场景</strong></li><li><strong>漏扫策略</strong>:推送时扫 / 定期重扫 / 阻止有 CVE 的镜像 pull</li><li><strong>签名</strong>:Notary v2(旧)/ cosign(新,推荐)</li></ul><h3 id="_2-2-一个真实部署的-harbor-配置取舍" tabindex="-1">2.2 一个真实部署的 Harbor 配置取舍 <a class="header-anchor" href="#_2-2-一个真实部署的-harbor-配置取舍" aria-label="Permalink to &quot;2.2 一个真实部署的 Harbor 配置取舍&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># values.yaml(Harbor Helm Chart,关键节选)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">expose</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ingress</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  tls</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    enabled</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    certSource</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">secret</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    secret</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      secretName</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">harbor-tls</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">externalURL</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">https://harbor.company.internal</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 存储:用 S3,不用 PVC</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">persistence</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  imageChartStorage</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">s3</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    s3</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      bucket</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">company-harbor-prod</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      region</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">us-east-1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      encrypt</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      secretkey</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${S3_SECRET_KEY}</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 用 External-Secrets 注入</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      accesskey</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${S3_ACCESS_KEY}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Trivy 内置扫描</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">trivy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  enabled</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  vulnType</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;os,library&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  severity</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  ignoreUnfixed</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 不忽略&quot;暂无修复&quot;的 CVE</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 复制 trigger(scheduled / on push)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在 UI 里配,不写 values.yaml</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 镜像保留策略</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在 Project 级配,不写 values.yaml</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># HA:核心组件至少 2 副本</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">core</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:    { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">replicas</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">jobservice</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">replicas</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">registry</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">replicas</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">portal</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:  { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">replicas</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># PG / Redis 用外部托管(RDS / Elasticache),不要 Harbor 自带的单点</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">database</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">external</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  external</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    host</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">pg-harbor.company.internal</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    port</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">5432</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    username</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">harbor</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    coreDatabase</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">registry</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">redis</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">external</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  external</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    addr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">redis-harbor.company.internal:6379</span></span></code></pre></div><p><strong>关键取舍解释</strong>:</p><ol><li><strong>存储用 S3 而不是 PVC</strong>——PVC 拉胯,S3 是对象存储天然适合镜像层(blob)</li><li><strong>PG / Redis 外部托管</strong>——Harbor 自带的 PG / Redis 是 single-instance,生产必须外置 HA</li><li><strong>核心组件 2 副本起</strong>——单副本宕一台就停服,中型团队不能接受</li><li><strong><code>ignoreUnfixed: false</code></strong>——&quot;还没修复的 CVE&quot;也要报,不然你永远不知道有哪些坑</li><li><strong>Trivy 扫描默认开,但策略分级</strong>——见下面&quot;漏洞分级&quot;章节</li></ol><hr><h2 id="三、镜像供应链的全景图-从构建到生产" tabindex="-1">三、镜像供应链的全景图:从构建到生产 <a class="header-anchor" href="#三、镜像供应链的全景图-从构建到生产" aria-label="Permalink to &quot;三、镜像供应链的全景图:从构建到生产&quot;">​</a></h2><p>这一张图是这一篇的灵魂——<strong>没看清这条链路,后面所有的&quot;签名 / 扫描 / 准入&quot;都是空中楼阁</strong>。</p><h3 id="_3-1-镜像供应链-ascii-全景" tabindex="-1">3.1 镜像供应链 ASCII 全景 <a class="header-anchor" href="#_3-1-镜像供应链-ascii-全景" aria-label="Permalink to &quot;3.1 镜像供应链 ASCII 全景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                       镜像从构建到生产的完整供应链                                  │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    开发者                  CI/CD 系统                Registry              K8s 集群</span></span>
<span class="line"><span>    ──────                  ─────────                ─────────              ─────────</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ① git push 代码</span></span>
<span class="line"><span>                            ② checkout 代码</span></span>
<span class="line"><span>                              拉 base image:</span></span>
<span class="line"><span>                              FROM golang:1.22-alpine        【风险点 1】</span></span>
<span class="line"><span>                              ↑ 第三方镜像被投毒(xz-utils)</span></span>
<span class="line"><span>                              拉依赖(go mod / npm / mvn)</span></span>
<span class="line"><span>                                                              【风险点 2】</span></span>
<span class="line"><span>                                                              ↑ 包仓库被投毒(codecov)</span></span>
<span class="line"><span>                            ③ build 镜像</span></span>
<span class="line"><span>                              docker build -t app:sha-abc</span></span>
<span class="line"><span>                              【风险点 3】runner 被劫持,</span></span>
<span class="line"><span>                                          构建出&quot;长得像但不是&quot;的镜像</span></span>
<span class="line"><span>                            ④ 扫描镜像</span></span>
<span class="line"><span>                              trivy / grype 扫 CVE         【这里是第一道门禁】</span></span>
<span class="line"><span>                            ⑤ 生成 SBOM</span></span>
<span class="line"><span>                              syft / docker buildx sbom</span></span>
<span class="line"><span>                            ⑥ 签名镜像</span></span>
<span class="line"><span>                              cosign sign                  【这里是签名生成】</span></span>
<span class="line"><span>                            ⑦ push registry</span></span>
<span class="line"><span>                              ─────────────────────────▶ ⑧ 接收镜像</span></span>
<span class="line"><span>                                                            存 blob 到 S3</span></span>
<span class="line"><span>                                                            【风险点 4】</span></span>
<span class="line"><span>                                                            ↑ Registry 被入侵,</span></span>
<span class="line"><span>                                                              tag 被替换为恶意镜像</span></span>
<span class="line"><span>                                                          ⑨ 定期重扫(Trivy)</span></span>
<span class="line"><span>                                                            新 CVE 出来时告警</span></span>
<span class="line"><span>                                                          ⑩ 复制到生产 Registry</span></span>
<span class="line"><span>                                                            (跨机房 / 跨云)</span></span>
<span class="line"><span>                                                                                   </span></span>
<span class="line"><span>                                                                                   ⑪ kubectl apply</span></span>
<span class="line"><span>                                                                                     image: app:sha-abc</span></span>
<span class="line"><span>                                                                                     【这里是第二道门禁】</span></span>
<span class="line"><span>                                                                                     ↓</span></span>
<span class="line"><span>                                                                                   ⑫ K8s 准入控制</span></span>
<span class="line"><span>                                                                                     (Kyverno / Gatekeeper / </span></span>
<span class="line"><span>                                                                                      connaisseur)</span></span>
<span class="line"><span>                                                                                     校验:</span></span>
<span class="line"><span>                                                                                      - image 来自白名单 registry</span></span>
<span class="line"><span>                                                                                      - 有有效 cosign 签名</span></span>
<span class="line"><span>                                                                                      - signer identity 匹配</span></span>
<span class="line"><span>                                                                                      - 镜像被扫过且无 CRITICAL CVE</span></span>
<span class="line"><span>                                                                                     不过 → deny</span></span>
<span class="line"><span>                                                                                     过 → 允许 pull</span></span>
<span class="line"><span>                                                                                   ⑬ kubelet pull</span></span>
<span class="line"><span>                                                                                     拉到本地</span></span>
<span class="line"><span>                                                                                     【风险点 5】</span></span>
<span class="line"><span>                                                                                     ↑ 中间人攻击 / </span></span>
<span class="line"><span>                                                                                       DNS 劫持</span></span>
<span class="line"><span>                                                                                       (HTTPS + digest 验证)</span></span>
<span class="line"><span>                                                                                   ⑭ container 启动</span></span>
<span class="line"><span>                                                                                     业务跑起来</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ───────────────────────────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>  签名验证链:</span></span>
<span class="line"><span>    image (sha256:abc...) </span></span>
<span class="line"><span>        ↓ 关联到</span></span>
<span class="line"><span>    signature (cosign 签的 sig)</span></span>
<span class="line"><span>        ↓ 验证用</span></span>
<span class="line"><span>    public key / certificate identity (fulcio / 公司 CA)</span></span>
<span class="line"><span>        ↓ 是否符合</span></span>
<span class="line"><span>    policy (Kyverno / OPA / cosign verify)</span></span></code></pre></div><p><strong>5 个风险点</strong>:</p><ol><li><strong>Base image 被投毒</strong>——xz-utils 2024.3</li><li><strong>包仓库被投毒</strong>——codecov / event-stream 等</li><li><strong>CI runner 被劫持</strong>——构建出&quot;长得像但不是&quot;的镜像</li><li><strong>Registry 被入侵 / tag 被替换</strong>——SolarWinds 同类型</li><li><strong>传输中被中间人</strong>——HTTPS + digest 防住 99%</li></ol><p><strong>对应防御</strong>:</p><ul><li>1, 2:base image 用 distroless / chainguard / 内部 mirror,锁版本</li><li>3:CI runner 隔离 + ephemeral + 最小权限 + 镜像签名</li><li>4:Registry 网络隔离 + RBAC + 复制审计 + 用 digest 引用而非 tag</li><li>5:K8s 准入控制层校验签名 + digest pin</li></ul><hr><h2 id="四、镜像签名-cosign-是事实标准" tabindex="-1">四、镜像签名:cosign 是事实标准 <a class="header-anchor" href="#四、镜像签名-cosign-是事实标准" aria-label="Permalink to &quot;四、镜像签名:cosign 是事实标准&quot;">​</a></h2><p><strong>镜像签名解决什么</strong>:<strong>保证&quot;集群里拉到的镜像就是 CI 出来的那个 hash&quot;</strong>——任何中间环节(registry 篡改、tag 漂移、被替换)都能在准入控制层被拦下。</p><h3 id="_4-1-为什么是-cosign-sigstore" tabindex="-1">4.1 为什么是 cosign / sigstore <a class="header-anchor" href="#_4-1-为什么是-cosign-sigstore" aria-label="Permalink to &quot;4.1 为什么是 cosign / sigstore&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>镜像签名历史:</span></span>
<span class="line"><span>  Docker Content Trust (DCT) / Notary v1:</span></span>
<span class="line"><span>    + Docker 官方</span></span>
<span class="line"><span>    - PKI 重,需要单独的 Notary server</span></span>
<span class="line"><span>    - 跟 OCI 标准脱节</span></span>
<span class="line"><span>    - 国内几乎没人用</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>  Notary v2 / OCI Image Signatures:</span></span>
<span class="line"><span>    + OCI 标准</span></span>
<span class="line"><span>    - 基础设施还在演进</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>  cosign / sigstore(2021-,现今主流):</span></span>
<span class="line"><span>    + sigstore 生态 + Linux Foundation 支持</span></span>
<span class="line"><span>    + keyless signing(OIDC)— 无需管私钥</span></span>
<span class="line"><span>    + 签名作为 OCI artifact 存在 registry,跟镜像一起</span></span>
<span class="line"><span>    + Kyverno / OPA / connaisseur 都原生支持</span></span>
<span class="line"><span>    + 国内国际都成主流</span></span></code></pre></div><p><strong>cosign 已经是事实标准</strong>。下面所有签名相关的工程都默认用 cosign。</p><h3 id="_4-2-cosign-的两种签名模式" tabindex="-1">4.2 cosign 的两种签名模式 <a class="header-anchor" href="#_4-2-cosign-的两种签名模式" aria-label="Permalink to &quot;4.2 cosign 的两种签名模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                          cosign 签名模式对比                                     │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>│   模式             私钥管理         身份证明              适合                    │</span></span>
<span class="line"><span>│  ──────────────────────────────────────────────────────────────────────────    │</span></span>
<span class="line"><span>│   Key-based       自己保管私钥      公钥就是身份          内部 CI / 离线环境       │</span></span>
<span class="line"><span>│   (传统)          (KMS / 文件)                          严合规要求 / 不连公网    │</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>│   Keyless         无私钥(动态)    OIDC identity         GitHub Actions /       │</span></span>
<span class="line"><span>│   (推荐)          (Fulcio 短期证书)(github / google /   GitLab CI / 公网项目   │</span></span>
<span class="line"><span>│                                     公司 OIDC)                                 │</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>Keyless 模式的工程价值</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统 key-based 的问题:</span></span>
<span class="line"><span>  - 私钥放哪都是问题(KMS? Vault? 文件?)</span></span>
<span class="line"><span>  - 私钥泄露所有签名作废</span></span>
<span class="line"><span>  - 私钥轮换工程量大</span></span>
<span class="line"><span>  - 谁签的不清楚(&quot;是 CI 还是工程师 A 签的?&quot;)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Keyless 模式:</span></span>
<span class="line"><span>  - cosign sign 时,从 GitHub Actions / GitLab CI 拿一个 OIDC token</span></span>
<span class="line"><span>  - cosign 向 Fulcio(sigstore 的 CA)用 OIDC 换一个&quot;短期证书&quot;</span></span>
<span class="line"><span>    证书里写明:&quot;这是 github.com/company/repo 在 main branch 上跑的 job 签的&quot;</span></span>
<span class="line"><span>  - 签名用短期证书,几分钟就过期</span></span>
<span class="line"><span>  - 签名 / 证书 / 透明日志(Rekor)三件套丢 registry</span></span>
<span class="line"><span>  - 验证时:校验签名 + 校验证书是从可信 CA 签的 + 校验证书里的 identity 符合策略</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>价值:</span></span>
<span class="line"><span>  - 不用管私钥</span></span>
<span class="line"><span>  - 签名带上&quot;这是 CI 在 main branch 上签的&quot;的强证据</span></span>
<span class="line"><span>  - 任何企图伪造的人都需要劫持 OIDC 链路,门槛极高</span></span></code></pre></div><h3 id="_4-3-一段-cosign-sign-verify-流程-20-行-shell" tabindex="-1">4.3 一段 cosign sign + verify 流程(20 行 shell) <a class="header-anchor" href="#_4-3-一段-cosign-sign-verify-流程-20-行-shell" aria-label="Permalink to &quot;4.3 一段 cosign sign + verify 流程(20 行 shell)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># CI 里:签名一个镜像</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># (假设 GitHub Actions 已经 docker push,得到一个镜像 digest)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">IMAGE</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;ghcr.io/company/orders-service@sha256:abc123def...&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1. Keyless sign(GitHub Actions OIDC)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">COSIGN_EXPERIMENTAL</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">1</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> cosign</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sign</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --yes</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$IMAGE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ↑ 自动:从 GHA 拿 OIDC token → 向 Fulcio 换证书 → 签名 → 推 Rekor 透明日志</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#         签名作为 OCI artifact 推回 registry,跟 image 同 repo</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2. (可选)绑定 SBOM</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">syft</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$IMAGE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> spdx-json</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sbom.spdx.json</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cosign</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> attach</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sbom</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --sbom</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sbom.spdx.json</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$IMAGE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cosign</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sign</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --yes</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --attachment</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sbom</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$IMAGE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 3. (可选)绑定漏洞扫描报告</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">trivy</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> image</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --format</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> json</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$IMAGE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> scan.json</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cosign</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> attest</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --yes</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --predicate</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> scan.json</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --type</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> vuln</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$IMAGE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ───────────────────────────────────────────────────────────────────</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 部署侧 / 准入控制侧:验证签名</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">COSIGN_EXPERIMENTAL</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">1</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> cosign</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> verify</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$IMAGE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --certificate-identity-regexp</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;^https://github.com/company/.+/.github/workflows/.+@refs/heads/main$&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --certificate-oidc-issuer</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://token.actions.githubusercontent.com</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 通过 → 0,失败 → 非 0</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 这条命令在 Kyverno / connaisseur 里被自动跑</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ol><li><strong><code>--certificate-identity-regexp</code></strong> —— 这是核心策略,规定&quot;只接受 main 分支 CI 签的镜像&quot;</li><li><strong><code>--certificate-oidc-issuer</code></strong> —— 锁死 OIDC 提供商,<strong>不要写通配</strong></li><li><strong>Rekor 透明日志</strong>——签名一推上去,公网可查,任何篡改 / 撤回都留痕</li><li><strong><code>cosign attest</code></strong> vs <strong><code>cosign sign</code></strong>:<code>sign</code> 签镜像本身,<code>attest</code> 签元数据(SBOM / 扫描报告 / 来源)</li></ol><h3 id="_4-4-完整签名链-image-→-signature-→-identity-→-policy" tabindex="-1">4.4 完整签名链:image → signature → identity → policy <a class="header-anchor" href="#_4-4-完整签名链-image-→-signature-→-identity-→-policy" aria-label="Permalink to &quot;4.4 完整签名链:image → signature → identity → policy&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>完整验证链(集群里拉镜像时):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  Pod spec: image: ghcr.io/company/orders@sha256:abc...</span></span>
<span class="line"><span>              │</span></span>
<span class="line"><span>              │ Kyverno / connaisseur 拦截</span></span>
<span class="line"><span>              ▼</span></span>
<span class="line"><span>  step 1: 从 registry 拉镜像 manifest</span></span>
<span class="line"><span>  step 2: 找该镜像的签名(同一个 repo,sha256-abc.sig)</span></span>
<span class="line"><span>  step 3: 校验签名是合法 cosign 签</span></span>
<span class="line"><span>  step 4: 解析签名里的 certificate</span></span>
<span class="line"><span>  step 5: 校验 certificate 是 Fulcio(可信 CA)签发</span></span>
<span class="line"><span>  step 6: 校验 certificate 里的 OIDC identity 符合策略:</span></span>
<span class="line"><span>            issuer: token.actions.githubusercontent.com</span></span>
<span class="line"><span>            subject: github.com/company/orders/.github/workflows/release.yml@refs/heads/main</span></span>
<span class="line"><span>  step 7: (可选)校验 Rekor 里有这条签名记录</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  全部通过 → 允许 pull</span></span>
<span class="line"><span>  任何一步失败 → deny,记录到事件 + 告警</span></span></code></pre></div><p><strong>这条链路里任何一步松了都是漏洞</strong>——比如 <code>certificate-identity-regexp</code> 写得太宽(允许任何 fork 的 CI 签的),攻击者 fork 你的 repo 跑一次 CI 就能签出&quot;合法&quot;镜像。</p><h3 id="_4-5-在-k8s-入口拦截-kyverno-opa-gatekeeper-connaisseur" tabindex="-1">4.5 在 K8s 入口拦截:Kyverno / OPA Gatekeeper / connaisseur <a class="header-anchor" href="#_4-5-在-k8s-入口拦截-kyverno-opa-gatekeeper-connaisseur" aria-label="Permalink to &quot;4.5 在 K8s 入口拦截:Kyverno / OPA Gatekeeper / connaisseur&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>三个主流方案对比:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  Kyverno:</span></span>
<span class="line"><span>    + 配置简单(YAML),K8s 原生</span></span>
<span class="line"><span>    + 中文文档好,Harbor 团队也推</span></span>
<span class="line"><span>    + 内置 cosign 验证 + image registry 白名单</span></span>
<span class="line"><span>    - 灵活度不如 OPA</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>  OPA Gatekeeper:</span></span>
<span class="line"><span>    + Rego 表达力强,任意复杂策略</span></span>
<span class="line"><span>    + CNCF 通用准入工具</span></span>
<span class="line"><span>    - 学习曲线陡,Rego 不好懂</span></span>
<span class="line"><span>    - cosign 集成需要自己写</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>  connaisseur:</span></span>
<span class="line"><span>    + 专门做镜像签名验证的小工具</span></span>
<span class="line"><span>    + 简单聚焦</span></span>
<span class="line"><span>    - 功能单一,只管签名</span></span>
<span class="line"><span>    - 维护活跃度一般</span></span></code></pre></div><p><strong>中型团队推荐 Kyverno</strong>——专注 K8s 准入这一件事,cosign 集成开箱即用。</p><h3 id="_4-6-一段最小-kyverno-镜像签名验证策略" tabindex="-1">4.6 一段最小 Kyverno 镜像签名验证策略 <a class="header-anchor" href="#_4-6-一段最小-kyverno-镜像签名验证策略" aria-label="Permalink to &quot;4.6 一段最小 Kyverno 镜像签名验证策略&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># kyverno-verify-images.yaml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">apiVersion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">kyverno.io/v1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">kind</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ClusterPolicy</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metadata</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">verify-image-signatures</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">spec</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  validationFailureAction</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Enforce</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # Enforce = 拒绝部署;Audit = 只告警</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  background</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                          # 不对存量 Pod 回溯检查</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  webhookTimeoutSeconds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">30</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 超时拒绝</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  rules</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">check-cosign-signature</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      match</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        any</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">resources</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              kinds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Pod</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              namespaces</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;prod-*&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;staging-*&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 只在 prod / staging 拦截</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      verifyImages</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">imageReferences</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;ghcr.io/company/*&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 只验证内部镜像</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;harbor.company.com/*&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          mutateDigest</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                 # 把 tag 改写为 digest pin</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          required</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                     # 必须有签名,否则拒</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          attestors</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">entries</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">keyless</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                    subject</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://github.com/company/*/.github/workflows/*@refs/heads/main&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                    issuer</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://token.actions.githubusercontent.com&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                    rekor</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                      url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">https://rekor.sigstore.dev</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ol><li><strong><code>Enforce</code> vs <code>Audit</code></strong> —— 第一次上线先 <code>Audit</code> 跑一周,确保没漏网,再切 <code>Enforce</code></li><li><strong><code>mutateDigest: true</code></strong> —— <strong>这是隐藏的杀手锏</strong>:Kyverno 会把 <code>image: app:v1.4.2</code> 自动改写为 <code>image: app@sha256:abc...</code>,<strong>防 tag 漂移</strong></li><li><strong><code>namespaces</code> 收敛</strong>——dev 不拦截(开发会试各种镜像),prod / staging 必须拦</li><li><strong><code>subject</code> 正则锁 main branch</strong> —— 防 fork / 分支偷签</li><li><strong><code>issuer</code> 锁死 GitHub</strong> —— 不接受任何其他 OIDC</li></ol><hr><h2 id="五、sbom-谁需要-怎么生成-谁来读" tabindex="-1">五、SBOM:谁需要 / 怎么生成 / 谁来读 <a class="header-anchor" href="#五、sbom-谁需要-怎么生成-谁来读" aria-label="Permalink to &quot;五、SBOM:谁需要 / 怎么生成 / 谁来读&quot;">​</a></h2><p><strong>SBOM</strong>(Software Bill of Materials,软件物料清单)——一份镜像里&quot;用了哪些依赖、什么版本、哪个 license、来自哪个上游&quot;的清单。</p><h3 id="_5-1-sbom-到底解决什么" tabindex="-1">5.1 SBOM 到底解决什么 <a class="header-anchor" href="#_5-1-sbom-到底解决什么" aria-label="Permalink to &quot;5.1 SBOM 到底解决什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没有 SBOM 的世界:</span></span>
<span class="line"><span>  Log4Shell(CVE-2021-44228)曝光后,你的第一反应:</span></span>
<span class="line"><span>    &quot;我们哪些服务用了 log4j 2.x?&quot;</span></span>
<span class="line"><span>    &quot;我们哪些镜像里间接依赖了 log4j?&quot;</span></span>
<span class="line"><span>    &quot;我们哪些第三方镜像里有 log4j?&quot;</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  传统做法:</span></span>
<span class="line"><span>    全公司发邮件 → 各组手动查 → 一周后大概查清</span></span>
<span class="line"><span>    遗漏 → 一个月后某个边角服务被 0day 打穿</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>有 SBOM 的世界:</span></span>
<span class="line"><span>  cd sboms/ &amp;&amp; grep -r &quot;log4j&quot; *.spdx.json | grep &quot;2\\.&quot;</span></span>
<span class="line"><span>  → 30 秒内列出所有受影响镜像</span></span>
<span class="line"><span>  → 1 小时内识别风险,优先级排队修</span></span></code></pre></div><p><strong>SBOM 的价值不是合规,是&quot;出大事时能 30 秒内回答影响范围&quot;</strong>——这才是它的工程价值。</p><h3 id="_5-2-谁会要-sbom" tabindex="-1">5.2 谁会要 SBOM <a class="header-anchor" href="#_5-2-谁会要-sbom" aria-label="Permalink to &quot;5.2 谁会要 SBOM&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>合规 / 监管:</span></span>
<span class="line"><span>  - 美国 EO 14028(2021)要求政府软件供应商必须提供 SBOM</span></span>
<span class="line"><span>  - 欧盟 Cyber Resilience Act(CRA,2024)同类要求</span></span>
<span class="line"><span>  - 国内等保 / 关基 / 金融监管也在跟进</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>客户 / 合作伙伴:</span></span>
<span class="line"><span>  - To-B 客户要求供应商提供 SBOM(SaaS 服务、金融客户尤其)</span></span>
<span class="line"><span>  - 上游开源项目要求下游提供 SBOM 反查依赖</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>内部:</span></span>
<span class="line"><span>  - 出 CVE 时快速定位影响范围(最关键的内部价值)</span></span>
<span class="line"><span>  - 检测&quot;代码里悄悄加进来的非授权依赖&quot;</span></span>
<span class="line"><span>  - License 合规审计(避免 GPL 污染商业产品)</span></span></code></pre></div><h3 id="_5-3-sbom-格式-spdx-vs-cyclonedx" tabindex="-1">5.3 SBOM 格式:SPDX vs CycloneDX <a class="header-anchor" href="#_5-3-sbom-格式-spdx-vs-cyclonedx" aria-label="Permalink to &quot;5.3 SBOM 格式:SPDX vs CycloneDX&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SPDX(Linux Foundation):</span></span>
<span class="line"><span>  + 历史悠久,合规友好</span></span>
<span class="line"><span>  + 美国政府 EO 钦定格式之一</span></span>
<span class="line"><span>  + 重 license 信息</span></span>
<span class="line"><span>  - JSON 嵌套深,读起来累</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>CycloneDX(OWASP):</span></span>
<span class="line"><span>  + 现代设计,JSON 结构清晰</span></span>
<span class="line"><span>  + 更适合&quot;漏洞 + 依赖&quot;场景</span></span>
<span class="line"><span>  + OWASP 系</span></span>
<span class="line"><span>  - license 信息没 SPDX 详细</span></span>
<span class="line"><span></span></span>
<span class="line"><span>两者可以互转,工具都支持。中型团队随便选一个,生态在哪选哪个。</span></span></code></pre></div><h3 id="_5-4-怎么生成-sbom-syft-docker-buildx" tabindex="-1">5.4 怎么生成 SBOM(syft / docker buildx) <a class="header-anchor" href="#_5-4-怎么生成-sbom-syft-docker-buildx" aria-label="Permalink to &quot;5.4 怎么生成 SBOM(syft / docker buildx)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 方法一:syft(独立工具,最常用)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">syft</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ghcr.io/company/orders:sha-abc123</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> spdx-json</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> orders.spdx.json</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">syft</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ghcr.io/company/orders:sha-abc123</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cyclonedx-json</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> orders.cdx.json</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 方法二:docker buildx 内置(BuildKit 0.13+)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> buildx</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> build</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --sbom=true</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --output</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> type=oci,dest=image.tar</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> orders:sha-abc123</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># SBOM 作为 OCI artifact 跟镜像一起存</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 方法三:CI 里把 SBOM 跟 cosign 签名一起绑定</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">syft</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$IMAGE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> spdx-json</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sbom.json</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cosign</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> attach</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sbom</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --sbom</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sbom.json</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$IMAGE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cosign</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sign</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --yes</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --attachment</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sbom</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$IMAGE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ol><li><strong>SBOM 在 CI 里生成,跟镜像同源</strong>——不要事后扫,会漏 build-time 的依赖</li><li><strong>跟签名一起绑定</strong>——cosign attach + sign,<strong>SBOM 本身可信</strong></li><li><strong>存档 + 索引</strong>——不只是文件,还要进数据库,grep 才快</li><li><strong>每次 build 都生成</strong>——SBOM 是镜像的&quot;快照&quot;,镜像不变 SBOM 不变</li></ol><h3 id="_5-5-sbom-的反模式" tabindex="-1">5.5 SBOM 的反模式 <a class="header-anchor" href="#_5-5-sbom-的反模式" aria-label="Permalink to &quot;5.5 SBOM 的反模式&quot;">​</a></h3><p><strong>反模式 1:SBOM 生成了但没人看</strong></p><p>我见过太多团队:CI 里 syft 跑了,SBOM 推到 S3,从此再也没打开过——<strong>等于没生成</strong>。SBOM 是工具,<strong>配套的&quot;出 CVE 时怎么查 SBOM 找影响范围&quot;流程才是价值</strong>。</p><p><strong>反模式 2:SBOM 不签名 / 不绑定镜像</strong></p><p>SBOM 文件自己丢在 S3 → <strong>任何人都能改 SBOM 内容</strong> → 你以为镜像里没 log4j,实际有。</p><p><strong>正确</strong>:<code>cosign attest --type spdxjson</code> 把 SBOM 作为 attestation 签上去,<strong>SBOM 跟镜像绑死且可校验</strong>。</p><p><strong>反模式 3:SBOM 只生成不查询</strong></p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 反例:出 CVE 了,人肉查 SBOM</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ls</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sboms/</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> xargs</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -I</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{} cat {} | grep log4j</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 正确:SBOM 进数据库 / OWASP Dependency-Track</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Dependency-Track 是开源 SBOM 管理平台,</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 自动跟 CVE 数据库对账,出 CVE 自动告警&quot;哪些镜像受影响&quot;</span></span></code></pre></div><p><strong>Dependency-Track</strong> 是 OWASP 的 SBOM 管理项目,<strong>中型团队 SBOM 落地的甜蜜区</strong>——syft 生成 SBOM 推到 Dependency-Track,出 CVE 自动告警。</p><hr><h2 id="六、镜像扫描-trivy-grype-snyk" tabindex="-1">六、镜像扫描:Trivy / Grype / Snyk <a class="header-anchor" href="#六、镜像扫描-trivy-grype-snyk" aria-label="Permalink to &quot;六、镜像扫描:Trivy / Grype / Snyk&quot;">​</a></h2><h3 id="_6-1-扫描器选型" tabindex="-1">6.1 扫描器选型 <a class="header-anchor" href="#_6-1-扫描器选型" aria-label="Permalink to &quot;6.1 扫描器选型&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Trivy(Aqua Security,CNCF):</span></span>
<span class="line"><span>  + 开源,生态最广</span></span>
<span class="line"><span>  + Harbor 内置,K8s 原生</span></span>
<span class="line"><span>  + OS 包 / 语言包 / IaC / Secret 多维度</span></span>
<span class="line"><span>  + 速度快</span></span>
<span class="line"><span>  推荐:大多数中型团队</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Grype(Anchore):</span></span>
<span class="line"><span>  + 开源,跟 syft 同生态</span></span>
<span class="line"><span>  + SBOM-first 设计(SBOM → CVE 关联)</span></span>
<span class="line"><span>  - 国内文档少</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Snyk(商业):</span></span>
<span class="line"><span>  + 商业级,深度漏洞库</span></span>
<span class="line"><span>  + 修复建议 + PR 自动化</span></span>
<span class="line"><span>  - 价格不菲</span></span>
<span class="line"><span>  推荐:有预算 / 强合规需求</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Docker Scout:</span></span>
<span class="line"><span>  + Docker 官方,Docker Hub 集成</span></span>
<span class="line"><span>  - 跟 Docker 绑定,生态不如 Trivy</span></span></code></pre></div><p><strong>中型团队推荐 Trivy</strong>——Harbor 内置,CI 里跑也方便,K8s 准入还能集成。</p><h3 id="_6-2-扫描在哪一层" tabindex="-1">6.2 扫描在哪一层 <a class="header-anchor" href="#_6-2-扫描在哪一层" aria-label="Permalink to &quot;6.2 扫描在哪一层&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>扫描时机          目的                                    阻断 / 告警</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>本地开发          快速反馈,修依赖                        告警(不阻断)</span></span>
<span class="line"><span>PR-time          阻止&quot;已知有 CVE 的代码&quot;合并             阻断</span></span>
<span class="line"><span>merge-time       一份镜像最终扫描                        阻断(CRITICAL)</span></span>
<span class="line"><span>push 到 registry  Harbor 拒绝有严重 CVE 的镜像入库        阻断(可配)</span></span>
<span class="line"><span>registry 定期重扫  新 CVE 出来时回溯告警                  告警 + ticket</span></span>
<span class="line"><span>入口准入(K8s)    最后一道防线,确保运行的镜像扫过        阻断 + 告警</span></span></code></pre></div><p><strong>多层扫描的工程价值</strong>:<strong>新 CVE 出现时,registry 重扫 + 告警</strong>——你的镜像构建时是干净的,但一周后 log4shell 类的 0day 曝光,registry 重扫马上告警,<strong>比靠人记&quot;哪个服务用了 log4j&quot;快几个数量级</strong>。</p><h3 id="_6-3-漏洞分级与-接受风险-流程" tabindex="-1">6.3 漏洞分级与&quot;接受风险&quot;流程 <a class="header-anchor" href="#_6-3-漏洞分级与-接受风险-流程" aria-label="Permalink to &quot;6.3 漏洞分级与&quot;接受风险&quot;流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>分级:</span></span>
<span class="line"><span>  CRITICAL  — 必须修,&lt; 7 天</span></span>
<span class="line"><span>  HIGH      — 必须修,&lt; 30 天</span></span>
<span class="line"><span>  MEDIUM    — 评估修,可接受风险但要记账</span></span>
<span class="line"><span>  LOW       — 通常不阻断,定期清理</span></span>
<span class="line"><span>  UNKNOWN   — 评估(没修复版本的也归这里)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>&quot;接受风险&quot;流程:</span></span>
<span class="line"><span>  - 不能&quot;扫描挂了就 ignore&quot;</span></span>
<span class="line"><span>  - CRITICAL / HIGH 必须修,不能接受</span></span>
<span class="line"><span>  - MEDIUM 走&quot;风险接受单&quot;:</span></span>
<span class="line"><span>    1. 工程师写理由(为什么不修)</span></span>
<span class="line"><span>    2. 安全 review 批</span></span>
<span class="line"><span>    3. 进 ticket 系统,带 deadline</span></span>
<span class="line"><span>    4. 到期再审,不能永久 ignore</span></span>
<span class="line"><span>  - Trivy \`.trivyignore\` 必须带注释 + 到期日期</span></span></code></pre></div><p><strong>反对的态度</strong>:<strong>&quot;Trivy 报告我们都看了,但太多了懒得修。&quot;</strong>——这是把扫描器报告当噪音的开始,长期下来扫描就废了。</p><p><strong>正确</strong>:<strong>Critical / High 零容忍,Medium 走流程,Low 可批量 ignore 但要记账</strong>。</p><h3 id="_6-4-扫描的反模式" tabindex="-1">6.4 扫描的反模式 <a class="header-anchor" href="#_6-4-扫描的反模式" aria-label="Permalink to &quot;6.4 扫描的反模式&quot;">​</a></h3><p><strong>反模式 1:扫描器误报疲劳</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工程师视角:</span></span>
<span class="line"><span>  扫描跑出来 200 条 HIGH CVE</span></span>
<span class="line"><span>  其中 180 条是 &quot;stat package 有漏洞但你没在用 stat 这个 API&quot;</span></span>
<span class="line"><span>  工程师看不过来 → 全 ignore</span></span>
<span class="line"><span>  剩下 20 条真正的也被忽略</span></span></code></pre></div><p><strong>修复</strong>:用支持&quot;reachability analysis&quot;的扫描器(Snyk Code / Datadog 静态扫描),<strong>只报&quot;代码实际调用到的&quot;漏洞</strong>——降噪 80%。</p><p><strong>反模式 2:Critical 不修</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某团队:</span></span>
<span class="line"><span>  CVE-2024-XXXX(Critical,RCE)</span></span>
<span class="line"><span>  Trivy 报了三个月</span></span>
<span class="line"><span>  工程师:&quot;我们这个服务在内网,没事&quot;</span></span>
<span class="line"><span>  → 三个月后,一次内网横向移动直接打穿</span></span></code></pre></div><p><strong>修复</strong>:<strong>Critical 永远不接受&quot;内网就安全&quot;的论证</strong>——纵深防御,内网不该是最后一道。</p><hr><h2 id="七、镜像-promotion-dev-→-staging-→-prod-怎么走" tabindex="-1">七、镜像 promotion:dev → staging → prod 怎么走 <a class="header-anchor" href="#七、镜像-promotion-dev-→-staging-→-prod-怎么走" aria-label="Permalink to &quot;七、镜像 promotion:dev → staging → prod 怎么走&quot;">​</a></h2><p><strong>Build once, deploy many</strong> 是上一篇 18 的核心原则。<strong>这里讲它在 registry 维度怎么落地</strong>。</p><h3 id="_7-1-反模式-每个环境重新构建" tabindex="-1">7.1 反模式:每个环境重新构建 <a class="header-anchor" href="#_7-1-反模式-每个环境重新构建" aria-label="Permalink to &quot;7.1 反模式:每个环境重新构建&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反例:</span></span>
<span class="line"><span>  CI 跑三次构建,产出三个 tag:</span></span>
<span class="line"><span>    company/orders:dev-abc</span></span>
<span class="line"><span>    company/orders:staging-abc</span></span>
<span class="line"><span>    company/orders:prod-abc</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  → 同一份代码,三个不同的镜像 digest</span></span>
<span class="line"><span>  → 完全违反 Build once</span></span>
<span class="line"><span>  → &quot;dev 过了 prod 挂了&quot;无法定位</span></span></code></pre></div><h3 id="_7-2-正确-tag-copy-promote" tabindex="-1">7.2 正确:tag / copy promote <a class="header-anchor" href="#_7-2-正确-tag-copy-promote" aria-label="Permalink to &quot;7.2 正确:tag / copy promote&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>正确流程:</span></span>
<span class="line"><span>  CI 跑一次构建,产出一个镜像:</span></span>
<span class="line"><span>    company/orders@sha256:abc...</span></span>
<span class="line"><span>    tag = sha-abc(永久)</span></span>
<span class="line"><span>    tag = main(浮动,指向 main 最新)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  Promote 到 staging:</span></span>
<span class="line"><span>    cosign copy company/orders@sha256:abc... \\</span></span>
<span class="line"><span>                staging-registry/orders@sha256:abc...</span></span>
<span class="line"><span>    (或者:同一个 registry,加一个 staging tag)</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>  Promote 到 prod:</span></span>
<span class="line"><span>    cosign copy staging-registry/orders@sha256:abc... \\</span></span>
<span class="line"><span>                prod-registry/orders@sha256:abc...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>关键:</span></span>
<span class="line"><span>  - 永远引用 digest(@sha256:...),不引用 tag</span></span>
<span class="line"><span>  - promote = 复制 / 加 tag,不重新构建</span></span>
<span class="line"><span>  - 镜像内容一字不差</span></span></code></pre></div><h3 id="_7-3-多-registry-vs-单-registry" tabindex="-1">7.3 多 registry vs 单 registry <a class="header-anchor" href="#_7-3-多-registry-vs-单-registry" aria-label="Permalink to &quot;7.3 多 registry vs 单 registry&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>单 registry + 多 project / 多 tag:</span></span>
<span class="line"><span>  Harbor:</span></span>
<span class="line"><span>    dev/orders:sha-abc</span></span>
<span class="line"><span>    staging/orders:sha-abc</span></span>
<span class="line"><span>    prod/orders:sha-abc</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  + 简单,运维少</span></span>
<span class="line"><span>  + 一个 Harbor 兜底</span></span>
<span class="line"><span>  - 单点风险(Harbor 挂了所有环境都挂)</span></span>
<span class="line"><span>  - 网络隔离做不到</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>多 registry(推荐生产场景):</span></span>
<span class="line"><span>  dev-registry.company.com/orders@sha256:abc  (内网开发用)</span></span>
<span class="line"><span>  prod-registry.company.com/orders@sha256:abc (生产网络专用)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  + 网络隔离(prod registry 不让 dev 集群访问)</span></span>
<span class="line"><span>  + 容灾(dev 挂了不影响 prod)</span></span>
<span class="line"><span>  + RBAC 更彻底</span></span>
<span class="line"><span>  - 运维成本×2</span></span></code></pre></div><p><strong>中型团队选择</strong>:<strong>起步单 registry + 多 project</strong>(Harbor),团队大了再上多 registry。</p><h3 id="_7-4-promotion-流程的工程实现" tabindex="-1">7.4 promotion 流程的工程实现 <a class="header-anchor" href="#_7-4-promotion-流程的工程实现" aria-label="Permalink to &quot;7.4 promotion 流程的工程实现&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .github/workflows/promote.yml(示意)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Promote Image</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  workflow_dispatch</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    inputs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      sha</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        description</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;git commit sha to promote&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        required</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        description</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;from env&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        required</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        default</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;staging&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      to</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        description</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;to env&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        required</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        default</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;prod&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">jobs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  promote</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    runs-on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ubuntu-latest</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    environment</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${{ inputs.to }}</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # GitHub Environment,自带 approval gate</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    steps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          IMAGE=&quot;ghcr.io/company/orders@sha256:\${{ inputs.sha }}&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          # 1. 校验源镜像签名</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          cosign verify &quot;$IMAGE&quot; \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            --certificate-identity-regexp &#39;^https://github.com/company/orders/.github/.+@refs/heads/main$&#39; \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            --certificate-oidc-issuer https://token.actions.githubusercontent.com</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          # 2. 校验源镜像有 SBOM + 扫描通过</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          cosign verify-attestation --type spdxjson &quot;$IMAGE&quot; ...</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          # 3. 复制到目标 registry(同一个 digest)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          cosign copy &quot;$IMAGE&quot; &quot;prod-registry.company.com/orders@sha256:\${{ inputs.sha }}&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          # 4. 重新签名(标记&quot;prod 已批准&quot;)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          cosign sign --yes \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            --annotation &quot;promoted-by=\${{ github.actor }}&quot; \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            --annotation &quot;promoted-from=\${{ inputs.from }}&quot; \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            &quot;prod-registry.company.com/orders@sha256:\${{ inputs.sha }}&quot;</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ol><li><strong><code>environment: prod</code></strong> —— GitHub Environment 内置 approval,<strong>人审通过才能 promote</strong></li><li><strong>promote 前必须 verify</strong> —— 不验证就 copy 等于失去签名链</li><li><strong>promote 后重签</strong> —— 标记&quot;prod 批准过&quot;,<strong>多一层信任</strong></li><li><strong>同一个 digest</strong> —— 这是 Build once 的本质</li></ol><hr><h2 id="八、真实威胁-四起改变行业的事件" tabindex="-1">八、真实威胁:四起改变行业的事件 <a class="header-anchor" href="#八、真实威胁-四起改变行业的事件" aria-label="Permalink to &quot;八、真实威胁:四起改变行业的事件&quot;">​</a></h2><h3 id="_8-1-solarwinds-2020" tabindex="-1">8.1 SolarWinds(2020) <a class="header-anchor" href="#_8-1-solarwinds-2020" aria-label="Permalink to &quot;8.1 SolarWinds(2020)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>事件:</span></span>
<span class="line"><span>  SolarWinds 的 Orion 软件构建流水线被入侵</span></span>
<span class="line"><span>  攻击者在 build 阶段注入恶意代码,签名照常通过(SolarWinds 自己的 CI 签的)</span></span>
<span class="line"><span>  18,000+ 客户安装了&quot;合法签名 + 有后门&quot;的 Orion 更新</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>启示:</span></span>
<span class="line"><span>  - 签名能保证&quot;是 SolarWinds 签的&quot;,不能保证&quot;SolarWinds 的 CI 没被入侵&quot;</span></span>
<span class="line"><span>  - 防御:build provenance(SLSA 框架)+ 多层签名 + 透明日志</span></span>
<span class="line"><span>  - cosign + Rekor 透明日志就是这思路的延伸</span></span></code></pre></div><h3 id="_8-2-codecov-2021" tabindex="-1">8.2 Codecov(2021) <a class="header-anchor" href="#_8-2-codecov-2021" aria-label="Permalink to &quot;8.2 Codecov(2021)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>事件:</span></span>
<span class="line"><span>  Codecov 的 bash uploader 脚本被入侵(改了一个字符)</span></span>
<span class="line"><span>  脚本里植入&quot;上传环境变量到攻击者服务器&quot;的逻辑</span></span>
<span class="line"><span>  几个月没被发现,大量 CI 的 token / Secret 泄露</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>启示:</span></span>
<span class="line"><span>  - 第三方 CI 依赖(uploader / action / 镜像)都是攻击面</span></span>
<span class="line"><span>  - 防御:第三方 action 锁 sha 不锁 tag(\`actions/checkout@a1b2c3\` 不要 \`@v4\`)</span></span>
<span class="line"><span>  - 内部 mirror 第三方依赖(npm / pip / docker)</span></span></code></pre></div><h3 id="_8-3-xz-utils-cve-2024-3094" tabindex="-1">8.3 xz-utils(CVE-2024-3094) <a class="header-anchor" href="#_8-3-xz-utils-cve-2024-3094" aria-label="Permalink to &quot;8.3 xz-utils(CVE-2024-3094)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>事件:</span></span>
<span class="line"><span>  开源压缩库 xz-utils 被一个&quot;维护者&quot; jiang 长期渗透</span></span>
<span class="line"><span>  在 5.6.0 / 5.6.1 版本里植入后门(条件触发,只在 sshd 链接 xz 时激活)</span></span>
<span class="line"><span>  几乎被合并进所有 Linux 发行版,几小时就被 RedHat 工程师偶然发现</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>启示:</span></span>
<span class="line"><span>  - 开源依赖的&quot;维护者身份&quot;也是攻击面</span></span>
<span class="line"><span>  - 防御:base image 用 distroless / chainguard(精简到只剩必要库)</span></span>
<span class="line"><span>  - SBOM + 定期重扫,新 CVE 出来快速响应</span></span></code></pre></div><h3 id="_8-4-镜像-typo-squatting" tabindex="-1">8.4 镜像 typo-squatting <a class="header-anchor" href="#_8-4-镜像-typo-squatting" aria-label="Permalink to &quot;8.4 镜像 typo-squatting&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>事件(类型):</span></span>
<span class="line"><span>  攻击者注册 docker.io/postgress(多了个 s)</span></span>
<span class="line"><span>  你写 Dockerfile 时手误:FROM postgress:16</span></span>
<span class="line"><span>  拉到的是恶意镜像</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>更阴险:</span></span>
<span class="line"><span>  - 注册接近名字的 npm / pip / cargo 包</span></span>
<span class="line"><span>  - 公司内部 package 名注册到公网,内部脚手架被引诱拉公网恶意包</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>启示:</span></span>
<span class="line"><span>  - base image 用 FROM &lt;internal-registry&gt;/postgres:16,不用 docker.io</span></span>
<span class="line"><span>  - 私有 package 不要起跟公网类似的名字</span></span>
<span class="line"><span>  - 内部 mirror 第三方依赖,从源头拦</span></span></code></pre></div><hr><h2 id="九、7-条踩坑" tabindex="-1">九、7 条踩坑 <a class="header-anchor" href="#九、7-条踩坑" aria-label="Permalink to &quot;九、7 条踩坑&quot;">​</a></h2><h3 id="_9-1-latest-tag" tabindex="-1">9.1 <code>latest</code> tag <a class="header-anchor" href="#_9-1-latest-tag" aria-label="Permalink to &quot;9.1 \`latest\` tag&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反模式:</span></span>
<span class="line"><span>  image: company/orders:latest</span></span>
<span class="line"><span>  → 这次拉到的 latest 跟上次拉到的不是同一个镜像</span></span>
<span class="line"><span>  → 出 bug 不知道是哪个版本</span></span>
<span class="line"><span>  → 回滚不知道回到什么</span></span></code></pre></div><p><strong>修复</strong>:<strong>所有生产引用必须用 digest 或 sha tag</strong>,<code>latest</code> 只能在本地开发用。Kyverno 可以强制 <code>mutateDigest: true</code> 自动改写。</p><h3 id="_9-2-未启用漏洞扫描" tabindex="-1">9.2 未启用漏洞扫描 <a class="header-anchor" href="#_9-2-未启用漏洞扫描" aria-label="Permalink to &quot;9.2 未启用漏洞扫描&quot;">​</a></h3><p><strong>反例</strong>:Harbor 装了但 Trivy 没开,以为镜像 push 上去就是干净的。<strong>事实</strong>:这只是&quot;我没扫&quot;。<strong>修复</strong>:Harbor 项目级别默认开扫描 + 阻止有 Critical CVE 的镜像入库。</p><h3 id="_9-3-签名密钥泄露" tabindex="-1">9.3 签名密钥泄露 <a class="header-anchor" href="#_9-3-签名密钥泄露" aria-label="Permalink to &quot;9.3 签名密钥泄露&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反例(key-based 签名场景):</span></span>
<span class="line"><span>  cosign 私钥放在 CI 的 Secret 里</span></span>
<span class="line"><span>  CI 配置文件意外让 fork 也能读</span></span>
<span class="line"><span>  → 任何人都能签出&quot;合法&quot;镜像</span></span></code></pre></div><p><strong>修复</strong>:<strong>用 keyless 模式</strong>(OIDC),根本不存私钥。必须用 key-based 时:Vault Transit / KMS,<strong>私钥不出 HSM</strong>。</p><h3 id="_9-4-sbom-没人看" tabindex="-1">9.4 SBOM 没人看 <a class="header-anchor" href="#_9-4-sbom-没人看" aria-label="Permalink to &quot;9.4 SBOM 没人看&quot;">​</a></h3><p>前面讲过——<strong>SBOM 生成了但没接入查询流程,等于没生成</strong>。修复:接 Dependency-Track / 类似工具,出 CVE 自动告警影响范围。</p><h3 id="_9-5-扫描器误报疲劳" tabindex="-1">9.5 扫描器误报疲劳 <a class="header-anchor" href="#_9-5-扫描器误报疲劳" aria-label="Permalink to &quot;9.5 扫描器误报疲劳&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反模式:</span></span>
<span class="line"><span>  Trivy 报 200 条 HIGH,工程师全 ignore</span></span>
<span class="line"><span>  下次真出事故,扫描完全失声</span></span></code></pre></div><p><strong>修复</strong>:</p><ul><li>用支持 reachability 的扫描器,只报实际可达的</li><li>必修 / 缓修 / 接受 三档,<strong>接受要走流程</strong></li><li><code>.trivyignore</code> 强制带&quot;原因 + 到期日&quot;</li></ul><h3 id="_9-6-内网镜像源单点" tabindex="-1">9.6 内网镜像源单点 <a class="header-anchor" href="#_9-6-内网镜像源单点" aria-label="Permalink to &quot;9.6 内网镜像源单点&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反模式:</span></span>
<span class="line"><span>  全公司一个 Harbor,挂了所有 K8s 部署停摆</span></span>
<span class="line"><span>  备份从来没演练过</span></span></code></pre></div><p><strong>修复</strong>:</p><ul><li>Harbor HA(多副本 + 外置 PG/Redis)</li><li>备份定期演练 restore</li><li>关键生产环境用多 registry 复制(Harbor replication)</li><li>K8s 节点 image cache(<code>imagePullPolicy: IfNotPresent</code>)让短期 registry 挂掉也不立刻影响</li></ul><h3 id="_9-7-镜像膨胀" tabindex="-1">9.7 镜像膨胀 <a class="header-anchor" href="#_9-7-镜像膨胀" aria-label="Permalink to &quot;9.7 镜像膨胀&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反模式:</span></span>
<span class="line"><span>  每个服务镜像 1.5GB(基于 ubuntu:22.04)</span></span>
<span class="line"><span>  K8s 集群里 100 个服务 → 节点 disk 撑爆</span></span>
<span class="line"><span>  CI build 慢、registry 存储贵、pull 拉得慢</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确:</span></span>
<span class="line"><span>  - 多阶段构建(builder stage + runtime stage)</span></span>
<span class="line"><span>  - runtime stage 用 distroless / scratch / chainguard</span></span>
<span class="line"><span>  - Go 静态二进制 → FROM gcr.io/distroless/static</span></span>
<span class="line"><span>  - Java → FROM eclipse-temurin:21-jre-alpine(JRE only,不是 JDK)</span></span>
<span class="line"><span>  - 镜像目标 &lt; 200MB</span></span></code></pre></div><div class="language-dockerfile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">dockerfile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 优化前(1.2GB)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> golang:1.22</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">WORKDIR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> /app</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">COPY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> . .</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">RUN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> go build -o orders ./cmd/orders</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">CMD</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;./orders&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 优化后(20MB)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> golang:1.22 </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">AS</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> builder</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">WORKDIR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> /app</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">COPY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> . .</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">RUN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> CGO_ENABLED=0 go build -ldflags=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;-s -w&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> -o orders ./cmd/orders</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> gcr.io/distroless/static:nonroot</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">COPY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> --from=builder /app/orders /orders</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">USER</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> nonroot:nonroot</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">CMD</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;/orders&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span></code></pre></div><hr><h2 id="十、何时不该上这套-以及-该上但要降级" tabindex="-1">十、何时不该上这套(以及&quot;该上但要降级&quot;) <a class="header-anchor" href="#十、何时不该上这套-以及-该上但要降级" aria-label="Permalink to &quot;十、何时不该上这套(以及&quot;该上但要降级&quot;)&quot;">​</a></h2><h3 id="_10-1-不该上完整签名-sbom-准入控制的场景" tabindex="-1">10.1 不该上完整签名 + SBOM + 准入控制的场景 <a class="header-anchor" href="#_10-1-不该上完整签名-sbom-准入控制的场景" aria-label="Permalink to &quot;10.1 不该上完整签名 + SBOM + 准入控制的场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 内部工具 / 实验项目</span></span>
<span class="line"><span>   → 镜像签名 + 准入控制是过度工程</span></span>
<span class="line"><span>   → 但镜像扫描应该开(Critical CVE 自动告警)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 团队 &lt; 3 人,服务 &lt; 10 个</span></span>
<span class="line"><span>   → 重在 CI 跑通 + 基础扫描</span></span>
<span class="line"><span>   → 签名 / SBOM 等团队大了再上</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 单一开发者 / 单一 CI 来源</span></span>
<span class="line"><span>   → &quot;Build once&quot; 不容易破,promote 流程简化</span></span>
<span class="line"><span>   → 但 base image 还是要锁版本 + 用 mirror</span></span></code></pre></div><h3 id="_10-2-该上但要降级" tabindex="-1">10.2 该上但要降级 <a class="header-anchor" href="#_10-2-该上但要降级" aria-label="Permalink to &quot;10.2 该上但要降级&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队 3-10 人,10-50 服务:</span></span>
<span class="line"><span>   - 上 Harbor + Trivy + 基础签名</span></span>
<span class="line"><span>   - 不一定上 Kyverno 准入控制(可以先 Audit 跑一段)</span></span>
<span class="line"><span>   - SBOM 起步,接入 Dependency-Track 还是后期</span></span>
<span class="line"><span>   - &quot;Build once&quot; 必须落地(这是最便宜的工程改进)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>团队 10-50 人,50-200 服务(本系列默认):</span></span>
<span class="line"><span>   - 完整供应链:Harbor + cosign + SBOM + Trivy + Kyverno</span></span>
<span class="line"><span>   - 多 registry 隔离 dev / prod</span></span>
<span class="line"><span>   - SBOM 接 Dependency-Track</span></span>
<span class="line"><span>   - 镜像 promotion 通过 GitOps 触发</span></span></code></pre></div><h3 id="_10-3-工具不是文化的替代品" tabindex="-1">10.3 工具不是文化的替代品 <a class="header-anchor" href="#_10-3-工具不是文化的替代品" aria-label="Permalink to &quot;10.3 工具不是文化的替代品&quot;">​</a></h3><p><strong>反对的态度</strong>:&quot;我们上了 cosign,供应链安全就完事了。&quot;</p><p><strong>真相</strong>:</p><ul><li><strong>签名能拦 registry 篡改,不能拦 CI 被劫持</strong> —— 还要 SLSA 来源校验</li><li><strong>扫描能拦已知 CVE,不能拦 0day</strong> —— 还要纵深防御</li><li><strong>准入控制能拦没签名的镜像,不能拦签名但带后门的镜像</strong> —— 还要审 base image</li><li><strong>SBOM 能列出依赖,不能保证依赖安全</strong> —— 还要审依赖来源</li></ul><p><strong>这条链路上每一环都有边界,组合起来才是工程</strong>。</p><hr><h2 id="十一、镜像供应链-checklist" tabindex="-1">十一、镜像供应链 checklist <a class="header-anchor" href="#十一、镜像供应链-checklist" aria-label="Permalink to &quot;十一、镜像供应链 checklist&quot;">​</a></h2><p>把这份贴到团队 wiki:</p><h3 id="镜像构建" tabindex="-1">镜像构建 <a class="header-anchor" href="#镜像构建" aria-label="Permalink to &quot;镜像构建&quot;">​</a></h3><ul><li>[ ] <strong>Base image 锁版本</strong>(<code>FROM golang:1.22.4-alpine</code> 而不是 <code>latest</code>)</li><li>[ ] <strong>Base image 来自可信源</strong>(distroless / chainguard / 内部 mirror)</li><li>[ ] <strong>多阶段构建</strong>,runtime stage 只含运行时必需</li><li>[ ] <strong>镜像 &lt; 200MB</strong>(中型团队基准)</li><li>[ ] <strong>镜像不含 secret</strong>(BuildKit <code>--mount=type=secret</code>)</li><li>[ ] <strong>以非 root 运行</strong>(<code>USER nonroot</code>)</li></ul><h3 id="registry" tabindex="-1">Registry <a class="header-anchor" href="#registry" aria-label="Permalink to &quot;Registry&quot;">​</a></h3><ul><li>[ ] <strong>Harbor / ECR 等有 HA</strong>,不能单点</li><li>[ ] <strong>存储外置</strong>(S3 / 对象存储)</li><li>[ ] <strong>网络隔离</strong>:prod registry 只 prod 集群能拉</li><li>[ ] <strong>复制策略</strong>:跨机房 / DR</li><li>[ ] <strong>保留策略</strong>:旧镜像自动清理,但要保留有 prod 跑的版本</li><li>[ ] <strong>RBAC 严</strong>:CI 推 / 集群拉 各自的最小权限账号</li></ul><h3 id="签名" tabindex="-1">签名 <a class="header-anchor" href="#签名" aria-label="Permalink to &quot;签名&quot;">​</a></h3><ul><li>[ ] <strong>所有 prod 镜像 cosign 签名</strong>(keyless 模式 / OIDC)</li><li>[ ] <strong>签名策略</strong>:<code>certificate-identity-regexp</code> + <code>oidc-issuer</code> 双锁</li><li>[ ] <strong>K8s 准入控制</strong>:Kyverno verify-images 拦截</li><li>[ ] <strong><code>Audit</code> 模式跑一周,确认无遗漏,再切 <code>Enforce</code></strong></li><li>[ ] <strong>Rekor 透明日志查询</strong>:出事故能查签名历史</li></ul><h3 id="sbom" tabindex="-1">SBOM <a class="header-anchor" href="#sbom" aria-label="Permalink to &quot;SBOM&quot;">​</a></h3><ul><li>[ ] <strong>CI 里生成 SBOM</strong>(syft / docker buildx)</li><li>[ ] <strong>SBOM 跟镜像绑定</strong>(cosign attest)</li><li>[ ] <strong>SBOM 进 Dependency-Track</strong>(或类似平台)</li><li>[ ] <strong>出 CVE 时能 30 秒内查影响范围</strong></li></ul><h3 id="漏洞扫描" tabindex="-1">漏洞扫描 <a class="header-anchor" href="#漏洞扫描" aria-label="Permalink to &quot;漏洞扫描&quot;">​</a></h3><ul><li>[ ] <strong>多层扫描</strong>:PR / merge / registry / 定期重扫</li><li>[ ] <strong>Critical CVE 阻断</strong>:CI / 准入控制都拦</li><li>[ ] <strong>风险接受流程</strong>:不能&quot;全部 ignore&quot;</li><li>[ ] <strong><code>.trivyignore</code> 必须有&quot;原因 + 到期日期&quot;</strong></li><li>[ ] <strong>降噪</strong>:用 reachability 分析,减少误报</li></ul><h3 id="promotion" tabindex="-1">Promotion <a class="header-anchor" href="#promotion" aria-label="Permalink to &quot;Promotion&quot;">​</a></h3><ul><li>[ ] <strong>Build once</strong>:一个镜像 digest 走完所有环境</li><li>[ ] <strong>promote = copy + retag</strong>,不重新构建</li><li>[ ] <strong>dev → staging → prod 顺序</strong>,跨环境必须人审</li><li>[ ] <strong>生产引用必须用 digest</strong> 不用 tag(Kyverno <code>mutateDigest</code>)</li></ul><hr><h2 id="十二、踩坑提醒" tabindex="-1">十二、踩坑提醒 <a class="header-anchor" href="#十二、踩坑提醒" aria-label="Permalink to &quot;十二、踩坑提醒&quot;">​</a></h2><ol><li><strong><code>latest</code> tag 上生产</strong>——下次拉的不是同一个镜像</li><li><strong>未启用扫描</strong>——Harbor 装了但 Trivy 没开,等于裸奔</li><li><strong>签名私钥泄露</strong>——用 keyless 模式根本不存私钥</li><li><strong>签名策略写太宽</strong>(<code>identity-regexp</code> 通配)——fork CI 也能签</li><li><strong><code>Enforce</code> 一次切</strong>(不先 Audit)——存量 Pod 全挂</li><li><strong>SBOM 生成了但没人看</strong>——没接入查询流程等于没生成</li><li><strong>扫描器误报疲劳</strong>——Critical / High 没分级处理,被噪音淹没</li><li><strong>接受风险没流程</strong>——<code>.trivyignore</code> 永久 ignore</li><li><strong>registry 单点</strong>——挂了所有部署停</li><li><strong>registry 没复制</strong>——机房挂了 prod 集群拉不到镜像</li><li><strong>每个环境重新构建</strong>——Build once 立刻破功</li><li><strong>镜像膨胀</strong>(1.5GB)——节点 disk 撑爆 + pull 慢</li><li><strong>base image 用 docker.io 公网</strong>(没 mirror)——速率限制 + 投毒风险</li><li><strong>第三方 action 不锁 sha</strong>(<code>actions/checkout@v4</code>)——上游被劫持就完蛋</li><li><strong>promote 不做签名验证</strong>(直接 copy)——失去信任链</li></ol><hr><h2 id="十三、小结" tabindex="-1">十三、小结 <a class="header-anchor" href="#十三、小结" aria-label="Permalink to &quot;十三、小结&quot;">​</a></h2><p>回到开篇——<strong>镜像供应链的核心问题不是&quot;我会不会构建出有漏洞的镜像&quot;,是&quot;集群里跑的镜像到底是不是我构建的那个&quot;</strong>。这一篇的所有工程结论围绕这条线展开:</p><ol><li><strong>制品仓库不只是放镜像</strong>——Harbor 是事实标准,JFrog 适合预算充足的大团队</li><li><strong>供应链全景图</strong>:构建 → 扫描 → SBOM → 签名 → push → 复制 → 准入 → pull → 跑,每一环都有风险点</li><li><strong>cosign keyless 签名</strong>:不用管私钥,身份用 OIDC 证明</li><li><strong>SBOM 解决&quot;出大事时回答影响范围&quot;</strong>——Log4Shell 时几小时和几天的差距</li><li><strong>多层扫描 + 风险分级 + 接受流程</strong>:不能用&quot;全 ignore&quot;对付报告</li><li><strong>Build once + digest pin + Kyverno mutateDigest</strong>:三件套防 tag 漂移</li><li><strong>真实事件提醒边界</strong>:SolarWinds(CI 被劫持)、codecov(第三方依赖)、xz-utils(维护者身份)、typo-squatting(base image 投毒)</li></ol><p><strong>镜像供应链是 CI/CD 这层最容易&quot;看上去做了&quot;但实际&quot;什么都没拦住&quot;的一层</strong>——你看 Harbor 部署起来了、cosign 在 CI 里跑了、Trivy 扫描开了,但只要 promotion 流程不严、policy 写得太松、SBOM 没人看,所有这些工具加起来还是裸奔。<strong>工程价值取决于流程闭环,不是工具开关</strong>。</p><hr><p>下一篇:<strong><code>20-GitOps与ArgoCD.md</code></strong>——<strong>这一层最重要的一篇</strong>,讲透 Pull 模式。前两篇产出了&quot;经过验证、签名、扫描的可信镜像&quot;,但<strong>这个镜像怎么进集群</strong>?是 CI 直接 kubectl apply(Push 模式),还是 ArgoCD 从 Git 拉(Pull 模式)?这两条路在安全模型、故障模型、运维模型上完全不同。<strong>讲完这一篇,你应该能在白板前讲清楚为什么 GitOps 的 Pull 模式是发布工程的方向、为什么 ArgoCD 是中型团队的事实标准、为什么 secret 进 Git 要用 SOPS 而不是裸 base64</strong>。</p>`,183)])])}const d=a(l,[["render",e]]);export{g as __pageData,d as default};
