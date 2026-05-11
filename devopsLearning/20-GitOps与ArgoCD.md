# GitOps 与 ArgoCD:Pull 模式 / 多环境 promote / drift 处理

第四层「CI/CD 与发布工程」的核心一篇——**这一篇必须看完**。前两篇讲清了 CI 心智(18)和镜像供应链(19),产出了"经过验证、签名、扫描的可信镜像"。**这个镜像怎么进集群**,是这一篇要彻底讲透的事——而这件事的工程取舍,决定了你的发布架构是"安全的、可审计的、可回滚的",还是"快但脆、出事就抓瞎"。

backendLearning/40 末尾给过 GitOps 一个段落的篇幅,**那不够**。**GitOps 是 K8s 时代发布工程的范式转移**——从"CI 把东西推到集群"变成"集群从 Git 拉自己该跑的样子"。这个范式转移背后,是 Pull 模式 vs Push 模式 在安全 / 故障 / 审计 / 多集群四个维度的彻底重构。**这一篇要把这件事讲透,讲到你能在白板前给团队讲清"为什么我们必须从 Jenkins 直推 K8s 切到 ArgoCD,这不是 buzz word"**。

> 一句话先记住:**Pull 模式的最大价值不是"自动化",是"凭据不出集群"**。Push 模式(CI 跑 `kubectl apply`)必然要给 CI 一份 prod 集群的 admin 凭据 —— **这是中型团队最大的爆炸半径**:CI runner 被攻破等于 prod 集群被攻破。Pull 模式(ArgoCD / Flux 在集群里跑,从 Git 拉)的凭据只是"只读 git",CI 永远碰不到 prod 集群。**这一条安全差别,就足以让任何一支负责生产的团队从 Push 切到 Pull**。后面所有的 GitOps 工程取舍,都在这个安全模型基础上展开。

---

## 一、问题场景:`kubectl apply` 时代的发布是什么样

讲 GitOps 之前先回头看看"没有 GitOps"的发布世界。

```
       Developer           CI/CD (Jenkins / GitLab Runner)        K8s Cluster
      git push ──────────▶  trigger pipeline
                              ├─ build image
                              ├─ push registry
                              ├─ kubectl config use-context prod
                              ├─ kubectl apply -f deploy.yaml ───▶ apiserver → Pod
                              └─ slack 通知"部署成功"

CI 需要的东西:
  - prod cluster 的 kubeconfig(或 SA token)
  - 这个凭据有 cluster-admin 或类似高权限
  - 凭据存在 CI 的 Secret 里

攻击面:
  - CI runner 被攻破 → prod kubeconfig 泄露 → prod 集群被入侵
  - CI Secret 配置错误(公开 fork 能读) → 全 K8s 集群暴露
  - CI 流水线被劫持 → 任意修改 prod 部署
```

我在多个团队亲历过 Push 模式的崩塌,具体表现是这几件事:

```
痛点一:Drift 是必然
  - 紧急 hotfix:工程师直接 kubectl edit deployment 改 image
  - 没改 Git → 下次 CI apply 把改回去,故障再现
  - 或者下次根本没 apply → Git 和集群永久不一致
  → "集群里到底跑的是什么"这个问题,没人能回答

痛点二:回滚靠"重新跑 CI"
  - 翻 Git 找上个 commit,改 image tag,跑 CI 全流程
  - 15-30 分钟过去,用户还在挨揍

痛点三:多集群难
  - 3 个机房,每个机房一份 kubeconfig
  - 第二个机房 apply 失败,前一个已经成功了
  - 部分集群跑新版本,部分跑旧版本,客户行为诡异

痛点四:可见性差
  - "我们集群里到底有多少应用?最后一次部署是什么时候?"
  - 答案:kubectl 一个个查,或翻 CI 历史(已清理)

痛点五:权限粒度粗
  - CI 凭据要么是 cluster-admin,要么按 namespace 切(工程量爆炸)
  - 没有"开发能改 dev,不能改 prod"的细分
  - 实际操作里"高级工程师本地有 prod kubeconfig"——泄密温床
```

**这五条痛点合起来**,就是中型团队上规模(50+ 微服务、多集群、多环境)后必撞的墙。**GitOps 是这堵墙的另一边**——不是工具升级,是发布范式的重做。

---

## 二、GitOps 的四原则:这不是新名词,是工程原则

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              GitOps 四原则                                       │
├────────────────────────────────────────────────────────────────────────────────┤
│  ① 声明式(Declarative)                                                        │
│     系统的"期望状态"用声明式表达(K8s YAML / Helm / Kustomize)                  │
│     不是过程式脚本(bash / ansible playbook)                                    │
│                                                                                │
│  ② 版本化(Versioned and Immutable)                                            │
│     "期望状态"全部存在 Git,带完整历史和 immutable hash                          │
│     任何变更走 PR,可审计可 review,可任意时间点回到任意历史版本                  │
│                                                                                │
│  ③ 自动拉取(Pulled Automatically)                                              │
│     集群里跑一个 controller,持续从 Git 拉"期望状态"                             │
│     不是 CI 推到集群,是集群主动拉                                                │
│                                                                                │
│  ④ 持续协调(Continuously Reconciled)                                           │
│     Controller 持续比对"Git 期望" vs "集群实际"                                 │
│     发现差异自动修正(或告警等人决策)                                            │
│     Drift 不是事件,是被持续消除的状态                                            │
└────────────────────────────────────────────────────────────────────────────────┘

四原则缺一不可:
  少 ①: ansible 推动作集合(过程式)——出错难恢复
  少 ②: 配置在 CI 变量里(版本化弱)——审计断
  少 ③: CI 还是直推(没真 Pull)——安全模型没变
  少 ④: 部署完就走(无 reconcile)——drift 复现
```

**GitOps ≠ Helm / Kustomize / ArgoCD**:Helm 是配置渲染工具、Kustomize 是 overlay 工具、ArgoCD 是 GitOps controller。**GitOps 是方法论,工具是落地**——用 Helm + ArgoCD 是 GitOps,用 Helm + Jenkins push 不是。**区别在"谁拉的"**。

---

## 三、Pull vs Push:这是这一篇的灵魂

### 3.1 Push 模式 ASCII 图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Push 模式(传统)                            │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────┐                                          ┌───────────────┐
  │ Developer│                                          │ Prod Cluster  │
  │ git push │                                          │   ┌────────┐  │
  └─────┬────┘                                          │   │apiserver│  │
        │ git                                           │   └────▲────┘  │
        ▼                                               │        │       │
  ┌──────────┐      ┌─────────────────┐                 │        │       │
  │ GitHub   │─────▶│   CI/CD         │  kubectl apply  │   ┌────┴────┐  │
  │          │webhk │   持有 prod     │────────────────▶│   │  Pods   │  │
  └──────────┘      │   kubeconfig!  │                 │   └─────────┘  │
                    └─────────────────┘                 └───────────────┘
                          ▲
                          │ 攻击面:
                          │ - CI 凭据泄露 = 集群沦陷
                          │ - CI runner 被劫持
                          │ - 公网 fork 读 Secret
                          
                                              网络方向:外 → 内(CI 主动连集群)
```

### 3.2 Pull 模式 ASCII 图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Pull 模式(GitOps)                          │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────┐                                          ┌───────────────┐
  │ Developer│                                          │ Prod Cluster  │
  │ git push │                                          │   ┌────────┐  │
  └─────┬────┘                                          │   │apiserver│  │
        │ git                                           │   └────▲────┘  │
        ▼                                               │        │       │
  ┌──────────┐                                          │   ┌────┴────┐  │
  │ Source   │      ┌─────────────────┐                 │   │ ArgoCD  │  │
  │ Repo     │      │  GitOps Repo    │◀────────────────┼───┤ (in     │  │
  │ (code)   │      │ (manifests /    │     pull        │   │ cluster)│  │
  └──────────┘      │  helm /         │                 │   └─────────┘  │
        │           │  kustomize)     │                 │        │       │
        │ CI push   └─────────────────┘                 │        ▼       │
        ▼                  ▲                            │   ┌─────────┐  │
  ┌──────────┐             │ commit "image: v1.4.3"    │   │  Pods   │  │
  │ CI       │─────────────┘                            │   └─────────┘  │
  │ build /  │ CI 凭据只有:                              └───────────────┘
  │ push img │  - registry push
  │          │  - GitOps repo write
  │          │  - 没有 prod 集群凭据!
  └──────────┘
                                              网络方向:内 → 外(集群主动连 Git)
```

### 3.3 安全模型对比表

```
维度              Push 模式             Pull 模式(GitOps)
─────────────────────────────────────────────────────────────
CI 凭据范围       prod admin            registry push + git write
集群入口          要开放给 CI 公网       可以完全关闭
凭据存在          CI 系统(攻击面广)    集群内 ServiceAccount
单点风险          CI 挂了无法部署       ArgoCD 挂了无法 reconcile
审计              CI 日志(易丢)        Git history(永久)
回滚              重跑 CI(15-30 min)   git revert(秒级)
Drift             需主动巡检            自动 reconcile
多集群            多份 kubeconfig       多个 ArgoCD instance
部署可视化        看 CI 历史            ArgoCD UI / tree view
权限粒度          CI 全或无             Git RBAC + Project RBAC
```

### 3.4 一个真实的攻击场景对比

```
场景:某中型公司 CI runner 被入侵
       (npm 依赖被 typo-squat,恶意代码在 CI 跑时窃取 secrets)

Push 模式:
  1. 恶意代码偷到 ~/.kube/config(prod cluster admin)
  2. 攻击者用 kubeconfig 直接连 prod apiserver
  3. kubectl exec 进任意 Pod,横向移动
  4. 偷 RDS 密码、改 image 部署 backdoor、删 etcd 备份
  → 几小时内致命级损失

Pull 模式:
  1. 恶意代码偷到 git write token
  2. 攻击者改 GitOps repo,提交一个恶意 commit
  3. PR review 流程 → 其他工程师看到这个 commit:
     "这是什么?image 改成奇怪的 registry?谁批准的?"
  4. PR 被 block,告警触发,事故响应启动
  5. 工程师 git revert 恶意 commit
  → 损失局限于"恶意 PR 被拦截"
```

**Push 模式不是"差",是"用错地方"**——它适合一次性 setup、bootstrap 阶段。**生产应用的发布,Pull 模式几乎是没有讨论余地的选择**。

---

## 四、ArgoCD 核心对象:Application / ApplicationSet / AppProject

```
AppProject ──────────┐ 定义"谁能干什么"的边界:允许哪些 git repo /
   │                 │ 允许哪些目标 namespace / 允许哪些 RBAC 角色
   ▼                 │
Application ─────────┤ 单个应用:一份 manifests 部署到一个目标
   │                 │ - source / destination / syncPolicy
   ▼                 │
ApplicationSet ──────┘ 工厂模式:一份模板生成 N 个 Application
                       适合"一仓库下每个目录起一个 App"、"PR 预览环境"
```

### 4.1 一段最小 ArgoCD Application yaml

```yaml
# orders-prod.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: orders-prod
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io   # App 删除时,清理它创建的资源
spec:
  project: payments-team              # 关联 AppProject(权限边界)
  source:
    repoURL: https://github.com/company/k8s-manifests.git
    targetRevision: main
    path: envs/prod/orders            # 仓库内路径
  destination:
    server: https://kubernetes.default.svc
    namespace: orders-prod
  syncPolicy:
    automated:                        # prod 慎用(见 drift 章节)
      prune: true                     # Git 里删了的,集群也删
      selfHeal: true                  # 手动改集群的会被改回
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true                # 防依赖删除顺序
      - ApplyOutOfSyncOnly=true       # 加速 sync
    retry:
      limit: 5
      backoff: { duration: 5s, factor: 2, maxDuration: 3m }
  revisionHistoryLimit: 10            # 保留 sync 历史(回滚用)
```

**关键取舍**:

1. **`automated.prune + selfHeal`** —— 这是真 GitOps,但 **prod 推荐 manual**(后面讲)
2. **`finalizers`** —— 必须有,否则删 App 时它创建的资源变孤儿
3. **`revisionHistoryLimit: 10`** —— ArgoCD 回滚就靠这个
4. **`PruneLast=true`** —— 防"删了 service 才删 deployment"的依赖顺序问题
5. **`project`** —— 所有 App 必须归 Project,**没 Project 等于没权限边界**

### 4.2 AppProject:权限边界

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata: { name: payments-team, namespace: argocd }
spec:
  sourceRepos:                        # 白名单 git repo
    - https://github.com/company/k8s-manifests.git
  destinations:                       # 允许的 cluster + namespace
    - server: https://kubernetes.default.svc
      namespace: 'orders-*'           # 收紧通配
  clusterResourceBlacklist:           # 禁止操作的集群级资源
    - { group: '', kind: 'Node' }
    - { group: 'rbac.authorization.k8s.io', kind: 'ClusterRoleBinding' }
  roles:
    - name: payments-admin
      policies:
        - p, proj:payments-team:payments-admin, applications, *, payments-team/*, allow
      groups: [company:payments-team]   # 绑 SSO group,不要给个人开账号
```

**关键**:`sourceRepos` 是核心——Project 内的 App **只能从白名单 repo 拉**,防止"开发拉个人 repo 部署到 prod"。`clusterResourceBlacklist` 让业务团队不能改 Node / ClusterRoleBinding,**防越权**。

### 4.3 ApplicationSet:批量生成

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata: { name: all-services-prod, namespace: argocd }
spec:
  generators:
    - git:
        repoURL: https://github.com/company/k8s-manifests.git
        revision: main
        directories: [{path: envs/prod/*}]
  template:
    metadata: { name: '{{path.basename}}-prod' }
    spec:
      project: '{{path.basename}}-team'
      source: { repoURL: ..., targetRevision: main, path: '{{path}}' }
      destination: { server: ..., namespace: '{{path.basename}}-prod' }
      syncPolicy: { automated: { prune: true, selfHeal: true } }
```

新加服务只要 mkdir 一个目录,ApplicationSet 自动生成 App。**一致性强,工程量小**。

---

## 五、App-of-Apps:套娃式管理

应用数量 > 30 个时,**用一个 ArgoCD Application 来管理其他 ArgoCD Applications**:

```
  ┌───────────────────┐
  │ root-app          │  (一个 Application)
  │ 指向 bootstrap/   │   它的 manifests 是什么?
  └───────┬───────────┘   答:其他 Application 资源!
          │ sync
          ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  orders-prod      payments-prod      users-prod              │
  │  (Application)    (Application)      (Application)           │
  │     │                 │                  │                   │
  │     │ 各自 sync        │                  │                   │
  │     ▼                 ▼                  ▼                   │
  │  实际业务资源       实际业务资源        实际业务资源              │
  └─────────────────────────────────────────────────────────────┘

Git 仓库结构:
  k8s-manifests/
  ├── bootstrap/                    ← root-app 指向这里
  │   ├── orders.yaml               ← 定义 orders-prod Application
  │   ├── payments.yaml
  │   └── users.yaml
  └── envs/prod/orders/...          ← orders-prod App 指向这里
```

**鸡生蛋问题**:root-app 怎么创建?手动 `kubectl apply root-app.yaml` 一次,**这一次手动叫"集群初始化 toil",可以接受**。之后所有变更走 Git——**这就是用 GitOps 管理 GitOps 自己**。

---

## 六、多环境 promote:三种仓库结构

### 6.1 选项 A:单仓库多文件夹(中型团队默认)

```
k8s-manifests/
├── base/                     ← 共享 base
│   ├── orders/
│   └── payments/
├── overlays/                 ← 各环境 overlay
│   ├── dev/orders/
│   ├── staging/orders/
│   └── prod/orders/
└── bootstrap/                ← App-of-Apps 配置

Promote 流程:
  cd overlays/staging/orders
  sed -i 's/image: orders:.*/image: orders:sha-abc123/' kustomization.yaml
  git commit -m "promote orders to staging: sha-abc123"
```

**优点**:一份 base 共享,跨环境 diff 一目了然,promote 流程清晰
**缺点**:权限粒度粗(改 prod 跟改 dev 一样难)

### 6.2 选项 B:单仓库多分支

```
分支:
  - main / dev / staging / prod
Promote: git merge dev → staging → prod
```

**社区共识:不推荐**——分支永久 diverge、merge 冲突频繁、不符合 Trunk-based。

### 6.3 选项 C:多仓库

```
k8s-manifests-dev/    ← dev 一个 repo,开发者可写
k8s-manifests-staging/ ← staging 一个 repo,QA 可写
k8s-manifests-prod/    ← prod 一个 repo,只 SRE 可写

Promote = 在目标 repo 提 PR 改 image tag
```

**优点**:权限隔离最彻底
**缺点**:三份 repo 维护,跨 repo diff 难,base 共享变难

### 6.4 三选一

```
团队 / 场景                            推荐
─────────────────────────────────────────────────────────
≤ 5 人 / 20 服务                       选项 A
5-30 人 / 20-100 服务(本系列默认)     选项 A(Kustomize)
> 30 人 / 严合规                       选项 C(多仓库)
传统 git 文化重                        选项 B(但不推荐)
```

**立场**:**中型团队默认选项 A(单仓库 + Kustomize)**——GitOps 最主流的姿势,文档最多踩坑最少。

### 6.5 最小 Kustomize overlay

```yaml
# base/orders/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources: [deployment.yaml, service.yaml, configmap.yaml]
commonLabels: { app: orders }
```

```yaml
# overlays/prod/orders/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: orders-prod
resources: [../../../base/orders]

# promote 改这里:
images:
  - name: ghcr.io/company/orders
    newTag: sha-abc123def              # ← 唯一需要改的地方

replicas:
  - { name: orders, count: 5 }         # prod 多副本

patches:
  - target: { kind: Deployment, name: orders }
    patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/resources/limits/cpu
        value: 2000m

configMapGenerator:
  - name: orders-config
    behavior: merge
    literals: [LOG_LEVEL=warn, FEATURE_FLAG_BETA=false]
```

**关键**:base 是通用模板,overlay 只改差异。`images:` 字段是 promote 的唯一入口——**改这一行 + commit = promote**。

---

## 七、配置渲染:Helm vs Kustomize vs Jsonnet

```
维度         Helm                Kustomize             Jsonnet
─────────────────────────────────────────────────────────────────
心智模型     模板渲染             overlay 叠加          编程语言渲染
K8s 原生     非原生               原生(kubectl 内置)   非原生
模板地狱     易(嵌套 if/range)    不存在                存在但风格清晰
ArgoCD 支持  原生                 原生                  需要 plugin
中型团队推荐  △(只用现成 Chart)   ✅(自己写 manifests) ✗(过度工程)
```

**Helm 的"模板地狱"**:`{{- include ... | nindent 4 }}` 这种语法少一个空格就挂,嵌套 `if` 容易写错。**Helm 适合"用现成的 Chart"**——bitnami / grafana / prometheus 的官方 Chart 直接用 `values.yaml` 覆盖参数就行。**自己写 Chart 99% 是过度工程**。

**Kustomize 的甜蜜点**:写出来的就是真 K8s YAML——IDE / linter 可校验,没有模板逻辑,kubectl 内置。**它就是给 GitOps 设计的**。

**Jsonnet 适用面极窄**:大厂级 monorepo 场景(Google / Grafana Labs),中型团队基本用不上这个表达力。

**推荐**:**业务服务用 Kustomize,第三方组件用 Helm(只用现成 Chart),不上 Jsonnet**。混用很常见,ArgoCD 都支持。

---

## 八、Flux vs ArgoCD 选型

```
维度          ArgoCD                      Flux
─────────────────────────────────────────────────────────────
风格          UI 重 + 命令式管理            CRD 重 + 声明式管理
学习曲线      平缓(看 UI 就懂)            陡(全靠 CRD,无 UI)
App 抽象      Application 资源              Kustomization / HelmRelease
Multi-tenancy AppProject(强)              按 namespace 切
UI            一流                          弱(后期补的 Weave GitOps)
镜像自动更新   需 ArgoCD Image Updater       内置(ImageRepository)
"看着推"      ✅                            ✗(纯声明式)
自动化彻底    △                             ✅
国内文档       好                            一般
中型团队推荐    ✅                            △
```

**立场**:**中型团队选 ArgoCD**——UI 价值被严重低估,**让一个非 SRE 工程师 5 分钟内能查"我的服务部署到哪了"**,这是 Flux 做不到的。Flux 适合"工程师全是声明式信仰者"的极客团队。

**混用模式也常见**:应用发布用 ArgoCD,平台 / 基础设施用 Flux——两者可以共存管不同 namespace。

---

## 九、Drift 处理:auto-sync 不是默认开关

**Drift = Git 期望状态 ≠ 集群实际状态**。GitOps 的承诺是"reconcile 消除它"——**但这个承诺的实现方式有取舍**。

```
Sync 策略             行为                                适合
──────────────────────────────────────────────────────────────────────
Manual               人触发 sync,显示 OutOfSync 等人按按钮  prod 推荐
Automated            Git 变 → 自动 sync,不动手改           dev / staging
+ selfHeal           检测到任何 drift 自动改回 Git           风险高,要纪律
+ prune              按上 + 删 Git 里没有的资源              很多团队不开
```

**为什么 auto-sync 在 prod 危险**:

```
场景:某天工程师在 GitOps repo 提了一个 PR
  "把 orders 的 replicas 从 5 改成 1"
  PR review 的人没注意,merge 了
  ArgoCD auto-sync: 5 → 1 瞬间
  prod 5000 QPS 立刻打到 1 个 Pod 上,雪崩

反思:
  - PR 没人仔细审
  - auto-sync 没缓冲
  - "merge 即生效"在 prod 是双刃剑
```

**推荐的混合策略**:

```
dev:      auto-sync + selfHeal + prune     快速反馈
staging:  auto-sync + selfHeal + prune     跟 prod 配置一样
prod:     manual sync,关 selfHeal          PR review 后,在 ArgoCD UI 点 Sync 才生效
                                            让"merge"和"发布"是两件事
```

**为什么 prod 不用 selfHeal**:prod 出事故时,工程师 `kubectl scale` 紧急扩容到 20 replicas——`selfHeal` 会检测 drift 改回 5,**紧急扩容白做事故恶化**。selfHeal 适合"违反纪律应该被改回去"的 dev / staging,**不适合 prod 这种允许应急 kubectl 改的环境**。

**Drift 检测但不强制改**:

```yaml
# 某些字段 ArgoCD 不应该看作 drift
ignoreDifferences:
  - group: apps
    kind: Deployment
    jsonPointers:
      - /spec/replicas        # HPA 在动态改 replicas,允许漂移
  - group: ""
    kind: Service
    jsonPointers:
      - /spec/clusterIP       # K8s 自动分配的,Git 里不写
```

ArgoCD UI 上 OutOfSync 一直显示,告警发出去,工程师决定:Git 该改 / 集群该改回 / 双方都接受漂移。

---

## 十、6 条 ArgoCD 踩坑

### 10.1 Secret 进 Git 明文

**反模式**:Secret yaml 直接 base64 编码进 Git。任何能 clone repo 的人 1 秒 `base64 -d` 明文。**修复**(看 27 篇配置管理):

- **SOPS + KSOPS plugin**:KMS 加密 secret.yaml,加密后进 Git,ArgoCD 集群内解密——**中型团队 GitOps 首选**
- **Sealed-Secrets**:集群内 controller 公钥加密,SealedSecret CRD 进 Git
- **External-Secrets**:Secret 不进 Git,放外部(Vault / AWS SM),Git 里只有引用

**红线**:**任何形式让明文 Secret 进 Git 都是事故**。GitOps 让 Git 成为部署来源,**也让 Git 成为最大的攻击面**。

### 10.2 CRD 与 App 依赖顺序

**反模式**:同时 apply CRD 和依赖该 CRD 的资源,CRD 还没注册就失败。**修复**——用 sync-wave 控制顺序:

```yaml
# CRD 资源标 sync-wave -1(先 apply)
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "-1"

# 用户资源标 sync-wave 0(后 apply)
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "0"
```

**数字越小越早 apply**。CRD 是经典 -1 的场景。

### 10.3 Namespace 创建竞态

ArgoCD App 指向不存在的 namespace,会失败。修复:`syncOptions: [CreateNamespace=true]`。**注意**:这样创建的 namespace 没有 label / annotation(比如 Linkerd sidecar injection 需要),**建议把 Namespace 资源也放 Git**。

### 10.4 ResourceQuota 卡 sync

prod namespace 配了 Quota 上限,新加的服务超过 quota → ArgoCD sync 部分成功,Deployment 创建了但 Pod 起不来。**修复**:ArgoCD App 配 healthCheck 看到 Pod pending 标 unhealthy,提前 plan 资源,用 LimitRange 兜底。

### 10.5 ArgoCD 自管理鸡生蛋

ArgoCD 自己也是 K8s 资源,谁部署?**bootstrap 阶段手动 `kubectl apply` 一次,之后用 ArgoCD 管 ArgoCD 自己**。

风险:你改 ArgoCD 自己的 config,ArgoCD 自己 sync 出问题,所有 App 都不 reconcile。**保险**:升级前 backup;维护一份纯 kubectl 重建脚本;ArgoCD HA(多副本);**定期演练**——删 ArgoCD 看能否快速重建。

### 10.6 多集群 RBAC

**反模式**:一个 ArgoCD 管 5 个集群,持有 5 份 cluster admin 凭据——ArgoCD 被攻破 = 5 个集群都沦陷。**修复**:每个 cluster 一份 RBAC 收紧的 ServiceAccount(不是 cluster-admin);AppProject 用 destinations 收紧;严重场景每个生产 cluster 一个独立 ArgoCD(代价:运维成本 × N)。

---

## 十一、何时不该上 GitOps

```
不该上:
  - 团队 < 5 人,K8s 资源 < 30 个 → ArgoCD 运维成本超过收益
  - 应用变更频率极低(月度发布)→ 手动发布也不会出错
  - 非 K8s 场景(Lambda / VM)→ 看 IaC + Terraform 那一层
  - 完全没有 Git 工程文化 → 先建 PR 流程再上 GitOps

该上但要降级(团队 5-10 人,服务 10-30):
  - 上 ArgoCD,但只用 Application 不用 ApplicationSet
  - 单仓库多文件夹 + Kustomize,够用
  - 所有环境 manual sync,先建立纪律
  - Secret 用 SOPS 起步

完整版(本系列默认 10-50 人,30-200 服务):
  - 完整 ArgoCD:Project + App + AppSet + App-of-Apps
  - 单仓库多文件夹(Kustomize)
  - dev / staging auto-sync,prod manual
  - SOPS / External-Secrets 组合
  - Image Updater 自动化镜像 promote
  - Kyverno 准入控制(配合 19 篇签名)
```

**GitOps 不是"自动发布"**。反对的态度:"我们上了 GitOps,发布全自动化了。"**真相**:GitOps 让发布变成"git commit + sync",但**不等于"merge 即上 prod"**。Auto-sync 在 prod 是危险的,必须配合 PR review + sync 审批。**渐进发布 / Feature Flag(21 / 22 篇)是 GitOps 的必要补充**——单靠 GitOps 的 sync,没有"灰度"概念。

---

## 十二、GitOps 实施 checklist

### 范式

- [ ] **Pull 模式**,CI 不直推集群,凭据不出集群
- [ ] **Git 是唯一来源**,手改的迟早被 reconcile / 至少被 audit

### 仓库 / ArgoCD

- [ ] **单仓库多文件夹 + Kustomize** + base / overlays / bootstrap
- [ ] **AppProject 给每个团队 / 业务线分**,配 sourceRepos / destinations 白名单
- [ ] **Application 关联 Project**,**prod manual sync**
- [ ] **dev / staging auto-sync + selfHeal + prune**
- [ ] **revisionHistoryLimit ≥ 10**,**finalizers 加上**,**ArgoCD HA + 定期 backup**

### Secret

- [ ] **不进 Git 明文** —— SOPS / Sealed / External-Secrets
- [ ] **dev / prod KMS key 隔离**,GitOps repo 加 gitleaks push hook

### Drift / Sync

- [ ] **prod manual,dev / staging auto-sync**
- [ ] **OutOfSync 接告警**
- [ ] **`ignoreDifferences` 覆盖 HPA / clusterIP**
- [ ] **sync-wave 控制 CRD 在前**,`PruneLast=true` 防资源依赖删除

### 灾难恢复

- [ ] **ArgoCD 自身 backup**,**季度演练**删 ArgoCD 重建
- [ ] **多集群场景:ArgoCD 单点风险评估**,严重场景独立 ArgoCD

---

## 十三、踩坑提醒

1. **Push 模式还在用,CI 持 prod 凭据** —— 最大爆炸半径
2. **Auto-sync 在 prod 没缓冲** —— merge 即发布,等于赌
3. **Secret 进 Git 明文 / base64** —— 等于密码贴墙上
4. **Application 没绑 AppProject** —— 全无权限边界
5. **自己写 Helm Chart** —— 99% 是过度工程
6. **CRD 和用户资源同 sync-wave** —— 依赖顺序炸
7. **prod selfHeal 开启** —— 紧急扩容被改回去
8. **`ignoreDifferences` 不配** —— HPA 永远显示 OutOfSync
9. **ArgoCD 单点** —— 没 HA / backup,挂了全停摆
10. **多集群一个 ArgoCD 持多 admin** —— 攻击面巨大
11. **ApplicationSet 模板写错** —— 一改生成 200 个错 App,清理灾难
12. **没演练过 ArgoCD 重建** —— 真挂的那天才发现 backup 不可用

---

## 十四、小结:GitOps 的真正承诺

回到开篇——**Pull 模式的最大价值不是"自动化",是"凭据不出集群"**。这一篇核心几条:

1. **Pull vs Push 的差别是安全模型** —— CI 是否需要 prod 凭据,这一条决定爆炸半径
2. **GitOps 四原则缺一不可** —— 声明式 / 版本化 / Pull / 持续协调
3. **ArgoCD 是中型团队事实标准** —— UI 重 + 多租户 + 国内文档好;Flux 适合"声明式洁癖"团队
4. **AppProject + Application + ApplicationSet + App-of-Apps** —— 套娃管理整个集群
5. **单仓库多文件夹 + Kustomize 是甜蜜区** —— 别一上来就多仓库 / 自写 Helm Chart
6. **Secret 必须有专门工具** —— SOPS / Sealed / External / Vault
7. **prod 不开 auto-sync** —— manual sync 是发布门禁,merge 和发布不是一件事
8. **Drift 检测但不强制改** —— `ignoreDifferences` + `sync-wave` 是工程细节

**GitOps 不是"工具升级",是发布工程的范式转移**——它把"发布"从"瞬时高权限操作"变成"多步骤、可审计、可拦截、可重现的工程流程"。**这个范式转移让发布事故的形态从"凌晨 3 点雪崩"变成"PR 阶段被 review 拦下"**。

**ArgoCD 是工具,GitOps 是工程纪律**。这两条结合起来,中型团队才能真正把 Change Failure Rate 这个数字压下去——这是 18 / 19 / 20 这三篇 CICD 基础合起来要解决的事。

---

下一篇:**`21-渐进发布.md`** —— GitOps 解决了"怎么把 Git 期望变成集群现实",但**"现实变更"本身也有节奏**——一次性把 prod 全量切到新版本是赌博,蓝绿 / 金丝雀 / 影子流量是把"切"这个动作变成"渐进、可观测、可自动回滚"的工程过程。**Argo Rollouts / Flagger 这一层,是 GitOps 之上的发布安全网**。讲完渐进发布,这一层「CI/CD 与发布工程」的工程闭环才算合上。
