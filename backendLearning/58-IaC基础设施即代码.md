# IaC 基础设施即代码

40 章把"代码到镜像到 K8s"的 CI/CD 串通了,但有个空白:**K8s 集群、RDS、VPC、负载均衡这些"基础设施"是怎么来的?**

如果还是"DBA 在控制台手点"——就和"运维改服务器配置不写 commit"一个量级的反模式。**IaC(Infrastructure as Code)** 把基础设施变成版本化的代码,跟业务代码一起进 Git。

---

## 一、为什么要 IaC

```
没 IaC 的世界:
  生产 RDS 是去年小张点出来的
  测试环境的 LB 是新人模仿点出来的
  灾备机房没人记得当时配了啥
  → 出事故重建?祝你好运

有 IaC 的世界:
  所有资源在 main.tf / values.yaml 里
  Code Review 走 PR 流程
  生产 = git checkout v1.2.3 && terraform apply
  灾备 = 同一份代码改个 region
```

| 问题 | 手工运维 | IaC |
| --- | --- | --- |
| 环境一致 | 几乎不可能 | 同一份代码部 N 遍 |
| 变更追溯 | 没记录 | git log + PR |
| 回滚 | 重新点回去? | git revert + apply |
| 灾备 | 半年演练一次 | 一条命令重建 |
| 新人上手 | 一年 | 看代码 |
| 审计 | 工单系统 | 代码 + Plan |

> 经验法则:**任何"在控制台点出来的"资源,都是技术债**。下次还要改,就把它 import 进 IaC 再改。

---

## 二、三大主流工具对比

```
   Terraform     Pulumi      CDK(AWS / CDK8s)
   ├ HCL DSL    ├ 真编程语言   ├ 真编程语言
   ├ 多云通用    ├ 多云通用    ├ 单云为主
   ├ 生态最广    ├ 类型友好    ├ 跟云厂商绑定
   └ 状态文件    └ 状态文件     └ 转 CFN / K8s YAML

         ↓ 部署到云

   Helm / Kustomize     ←── K8s 内的"包管理 / 模板"
```

| 工具 | DSL/语言 | 适合 |
| --- | --- | --- |
| **Terraform** | HCL | **多云 / 跨平台 IaC,事实标准** |
| **Pulumi** | TS/Go/Python/C# | 喜欢用代码而非 DSL,需要循环 / 函数 |
| **AWS CDK** | TS/Python | 全 AWS 栈,深度集成 |
| **Helm** | Go template + YAML | K8s 应用打包 |
| **Kustomize** | 无模板,纯 YAML overlay | 简单环境差异 |
| **CDK8s** | TS/Python | 用代码生成 K8s YAML |
| **CloudFormation** | YAML/JSON | AWS 原生,但 HashiCorp Terraform 生态远大 |

**当前主流推荐**:**Terraform(基础设施)+ Helm(K8s 应用)+ ArgoCD(GitOps)**——这是 90% 现代云原生项目的组合。

> 经验法则:**HashiCorp 在 2023 改了 Terraform 协议许可**,引发社区 fork 出 **OpenTofu**(完全开源,语法兼容)。商业敏感项目走 OpenTofu,语法/生态几乎无差。

---

## 三、Terraform 心智模型

```
.tf 文件(声明式描述)
        ↓
   terraform plan         ←── 算出"要建/改/删什么"
        ↓
   terraform apply        ←── 真去做
        ↓
   .tfstate(状态文件)    ←── 真实云资源 ↔ 代码的映射
```

**三个文件类型**:

```
main.tf       资源定义
variables.tf  输入变量
outputs.tf    输出值
versions.tf   版本约束
```

```hcl
# versions.tf
terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {                  # state 远程存储
    bucket = "my-tfstate"
    key    = "prod/network.tfstate"
    region = "us-east-1"
  }
}

# main.tf
provider "aws" { region = var.region }

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags = { Name = "prod-vpc", Env = "prod" }
}

resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
}
```

```bash
terraform init      # 拉 provider、连 backend
terraform plan      # 看变更预览
terraform apply     # 执行
terraform destroy   # 销毁(慎用,有些资源带 lifecycle.prevent_destroy)
```

---

## 四、State 文件:Terraform 的命门

`.tfstate` 是 Terraform 的"账本"——它知道"哪个 .tf 资源对应云上哪个真实 ID"。

**绝对禁止**:

- 把 state 提交到 Git(里面有密钥)
- 多人本地各自改 state(必冲突)
- 直接编辑 state 文件

**正确姿势**:**远程 backend + 锁**:

```hcl
backend "s3" {
  bucket         = "my-tfstate"
  key            = "prod/main.tfstate"
  region         = "us-east-1"
  dynamodb_table = "tflock"        # 加锁,防并发 apply
  encrypt        = true
}
```

| Backend | 适合 |
| --- | --- |
| **S3 + DynamoDB** | AWS 项目 |
| **GCS** | GCP |
| **Azure Storage** | Azure |
| **Terraform Cloud / HCP** | 托管,带 UI 和审批流 |
| **Spacelift / env0** | 第三方协作平台 |

> 经验法则:**生产环境的 Terraform 必须远程 backend + 锁 + 加密**。本地 .tfstate 只能在玩具项目用。

---

## 五、Module:别把所有资源堆 main.tf

把同类资源封装成 module,**像调用函数一样复用**。

```hcl
# modules/vpc/main.tf
variable "cidr"    { type = string }
variable "azs"     { type = list(string) }

resource "aws_vpc" "this" { cidr_block = var.cidr }
resource "aws_subnet" "private" { for_each = toset(var.azs) ... }

output "vpc_id"    { value = aws_vpc.this.id }
output "subnets"   { value = aws_subnet.private[*].id }
```

```hcl
# 使用 module
module "prod_vpc" {
  source = "./modules/vpc"
  cidr   = "10.0.0.0/16"
  azs    = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

module "rds" {
  source     = "./modules/rds"
  vpc_id     = module.prod_vpc.vpc_id
  subnet_ids = module.prod_vpc.subnets
}
```

**社区 module 仓库**:[Terraform Registry](https://registry.terraform.io)——AWS VPC / EKS / RDS / ALB 全有,直接用别人写好的。

> 经验法则:**自己写 module 之前先去 Registry 找**。AWS / GCP / Azure 主流资源,terraform-aws-modules 这种官方 module 已经踩好了所有坑。

---

## 六、环境分层:dev / staging / prod 怎么管

```
infra/
├── modules/                    ← 可复用模块
│   ├── vpc/
│   ├── eks/
│   └── rds/
├── envs/
│   ├── dev/
│   │   ├── main.tf            ← 调 module + dev 参数
│   │   └── backend.tf
│   ├── staging/
│   └── prod/
└── global/                    ← IAM / DNS 等全局资源
```

**每个环境独立 backend、独立 state**——dev 出事不影响 prod。

```hcl
# envs/prod/main.tf
module "vpc" {
  source = "../../modules/vpc"
  cidr   = "10.0.0.0/16"
}

module "eks" {
  source       = "../../modules/eks"
  cluster_name = "prod-cluster"
  node_size    = "m6i.xlarge"
  min_nodes    = 5
}
```

**Workspaces 也行,但更复杂**:

```bash
terraform workspace new prod
terraform workspace select prod
```

---

## 七、Helm:K8s 的包管理器

K8s 应用部署方式三选一:

```
原生 YAML         手写 Deployment / Service / Ingress
Kustomize         多 overlay,差异叠加
Helm Chart        模板 + values.yaml,真正的"包"
```

Helm 是**事实标准**——nginx-ingress、cert-manager、prometheus、grafana,所有主流组件都有官方 Helm Chart。

### Chart 结构

```
mychart/
├── Chart.yaml          ← 元信息
├── values.yaml         ← 默认配置
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── _helpers.tpl
└── charts/             ← 子依赖
```

```yaml
# templates/deployment.yaml(Go template)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "mychart.fullname" . }}
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - name: app
          image: "{{ .Values.image.repo }}:{{ .Values.image.tag }}"
          resources: {{- toYaml .Values.resources | nindent 12 }}
```

```yaml
# values.yaml
replicaCount: 3
image:
  repo: registry.example.com/myapp
  tag: 1.2.3
resources:
  requests: { cpu: 200m, memory: 256Mi }
  limits:   { cpu: 1,    memory: 1Gi }
```

```bash
helm install myapp ./mychart -n prod
helm upgrade myapp ./mychart -n prod -f values-prod.yaml
helm rollback myapp 5 -n prod      # 回滚到 release 5
```

---

## 八、Helm 的多环境技巧

```
mychart/
├── values.yaml             ← 默认
├── values-dev.yaml         ← dev override
├── values-staging.yaml
└── values-prod.yaml
```

```bash
helm upgrade myapp ./mychart -f values.yaml -f values-prod.yaml
# 后面的 values 覆盖前面的
```

或者用 **Helmfile**(批量管理多个 release):

```yaml
# helmfile.yaml
releases:
  - name: nginx-ingress
    chart: ingress-nginx/ingress-nginx
    version: 4.10.0
    namespace: ingress
    values: [./values/nginx.yaml]

  - name: cert-manager
    chart: jetstack/cert-manager
    version: 1.14.0
    namespace: cert-manager
```

```bash
helmfile sync   # 一条命令把全集群应用拉齐
```

---

## 九、Kustomize:更轻的环境差异化

不用模板,**用"叠加"(overlay)**:

```
base/
├── deployment.yaml
├── service.yaml
└── kustomization.yaml

overlays/
├── dev/
│   ├── kustomization.yaml      ← 引用 base + dev 差异
│   └── replica-patch.yaml
└── prod/
    ├── kustomization.yaml
    └── replica-patch.yaml
```

```yaml
# overlays/prod/kustomization.yaml
resources:
  - ../../base
patches:
  - replica-patch.yaml      # 把 replicas 改成 10
images:
  - name: myapp
    newTag: 1.2.3
```

```bash
kubectl apply -k overlays/prod
```

> 经验法则:**简单环境差异(副本数、镜像 tag)用 Kustomize**,**复杂模板逻辑(条件、循环)用 Helm**。混用也行——Helm Chart + Kustomize 后处理。

---

## 十、Pulumi:用真编程语言写基础设施

Terraform 的 HCL 在复杂逻辑下笨拙,Pulumi 让你用 TypeScript / Python / Go 写:

```typescript
// index.ts
import * as aws from "@pulumi/aws";

const vpc = new aws.ec2.Vpc("main", { cidrBlock: "10.0.0.0/16" });

const azs = ["us-east-1a", "us-east-1b", "us-east-1c"];
const subnets = azs.map((az, i) => new aws.ec2.Subnet(`private-${i}`, {
  vpcId: vpc.id,
  cidrBlock: `10.0.${i}.0/24`,
  availabilityZone: az,
}));

export const vpcId = vpc.id;
```

**优势**:类型安全、IDE 补全、复杂逻辑写得清爽。
**劣势**:生态比 Terraform 小,招聘市场上人少。

> 经验法则:**全栈 TS 团队 / 复杂 IaC 编排 → Pulumi**;**多云通用 / 招聘容易 → Terraform**。新项目大多还是 Terraform。

---

## 十一、GitOps:把 IaC + 部署都拉进 Git

40 章讲过 ArgoCD,**这里把"基础设施"也纳入 GitOps**:

```
                Git 仓库
   ┌─────────────────────────────────────┐
   │  infra/  Terraform / Pulumi          │ ──▶ Atlantis / Spacelift / TF Cloud
   │  k8s/    Helm Charts / values        │ ──▶ ArgoCD
   │  apps/   业务代码                    │ ──▶ CI 构建镜像 + 改 k8s/values
   └─────────────────────────────────────┘
              ▲
              │ PR 评审 / 合并
   开发提 PR
```

**所有变更必须经 PR**——人工审批 plan 输出后再 apply,绝不允许工程师本地直接 apply 生产。

| 工具 | 干什么 |
| --- | --- |
| **Atlantis** | PR 上自动 `terraform plan`,把输出贴到 PR comment |
| **Spacelift / env0 / TF Cloud** | 托管的 Terraform 流水线,带审批、漂移检测 |
| **ArgoCD / Flux** | K8s 应用的 GitOps,values.yaml 改了自动同步 |

---

## 十二、漂移检测(Drift Detection)

线上资源被人手工改了 / 控制台动了 → **真实状态与代码不一致**,叫"漂移"。

```bash
terraform plan     # 显示"实际跟代码不一样"
```

**Spacelift / Atlantis / TF Cloud** 都能定时跑 plan,**漂移立刻告警**。

> 经验法则:**生产环境每周做一次漂移检测**——长期不查,IaC 最终变成"装饰文件"。

---

## 十三、敏感变量管理

```hcl
variable "db_password" {
  sensitive = true       # plan / apply 输出会被打 ***
}
```

**密钥来源**:

| 方案 | 适合 |
| --- | --- |
| **HashiCorp Vault** | 动态生成 / 一次性密钥 |
| **AWS Secrets Manager / Parameter Store** | AWS 原生 |
| **Sealed Secrets / SOPS** | Git 里加密存储 |
| **External Secrets Operator** | K8s 拉 Vault / SM 当 Secret |

**禁止**:

- 把密钥明文写 `.tf` / `values.yaml`
- 把密钥写到 `.tfstate`(state 不加密就泄密)
- 把密钥放 Slack / 工单 / 邮件

---

## 十四、IaC 的成本管理

```
infrastructure 长得快,谁也没控制
   ↓
账单出来,$$$ 超预算
```

工具:

| 工具 | 干什么 |
| --- | --- |
| **Infracost** | PR 上估算"这个 PR 加了多少钱/月" |
| **AWS Cost Explorer / GCP Billing** | 事后看账单 |
| **OpenCost** | K8s 工作负载级成本 |
| **policy as code(OPA / Sentinel)** | "禁止开 8xlarge 实例"这种规则 |

```yaml
# Infracost 在 PR 里贴
+ aws_db_instance.main
  +$540/month   db.r5.xlarge

+ aws_eks_cluster.main
  +$72/month
```

> 经验法则:**IaC 不接成本工具就是给老板烧钱**。Infracost + budget alert 是基本面。

---

## 十五、常见踩坑

1. **state 文件提交到 Git**:密钥泄露,经典事故
2. **多人本地 apply**:state 冲突,资源被双重创建
3. **没远程 backend / 锁**:并发 apply 把基础设施搞乱
4. **destroy 没加 prevent_destroy**:测试时一个手抖把生产 RDS 删了
5. **手工改控制台**:漂移积累,IaC 失效
6. **module 版本不锁**:某天 provider 升级语法变了,plan 全是 diff
7. **环境共用 state**:dev 影响 prod
8. **Terraform 版本团队不一致**:state 升级后老版本读不了
9. **values.yaml 把密钥塞里**:Git 历史永久泄密
10. **Helm 模板用 indent 而非 nindent**:YAML 格式错误,排查半天
11. **CRD 升级用 helm upgrade**:Helm 不管 CRD,得手动 kubectl apply
12. **Pulumi state 在 cloud,本地缓存不一致**:并发跑会错
13. **没漂移检测**:三个月后 IaC 跟现实差十万八千里
14. **Terraform 写循环不用 `for_each` 用 `count`**:中间删一个,后面全 ID 错位
15. **没接 Infracost**:某次 PR 多了 5 个 NAT Gateway,月底惊讶

---

## 十六、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ Terraform / Pulumi 起步 | 多云通用 IaC |
| ✅ 远程 backend + 锁 + 加密 | state 安全 |
| ✅ Module 化 + 用 Registry 已有 | 不重复造轮子 |
| ✅ 环境分目录 + 独立 state | dev/staging/prod 隔离 |
| ✅ K8s 应用用 Helm | 事实标准 |
| ✅ values 多文件分环境 | 默认 + 环境 override |
| ✅ Atlantis / TF Cloud / Spacelift | PR 流程化 |
| ✅ ArgoCD / Flux 同步 K8s | GitOps |
| ✅ 密钥外置(Vault / SOPS) | 不入 Git |
| ✅ 定期漂移检测 | 至少每周 |
| ✅ Infracost PR 显示成本 diff | 防失控 |
| ✅ prevent_destroy 锁关键资源 | 防误删 |

---

## 小结

IaC 是**让基础设施像代码一样可审计、可回滚、可复用**——它不是一个工具,是工程文化。

记住三件事:

1. **生产环境任何资源都该在 Git 里**——控制台操作必有事故,只是早晚
2. **state 是命门**——远程 backend + 锁,没商量
3. **基础设施 + 应用 + 业务代码三层都进 GitOps**——这是云原生项目的成熟形态

下一章我们沉到生产保障的最高层——**SRE 实践 + 混沌工程**:SLO / SLI / 错误预算、故障演练、把"高可用"从口号变成数据。
