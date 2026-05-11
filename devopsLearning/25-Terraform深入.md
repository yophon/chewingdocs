# Terraform 深入:state 后端 / module 设计 / drift / import / Terragrunt

上一篇讲了 IaC 心智,讲完你应该明白:**Terraform 是工具,IaC 是契约**。这一篇回到地面,讲 Terraform 这件工具本身——**它是 IaC 这一层事实标准,90% 的中型团队基础设施都跑在它上面**。

但事实标准不等于无脑用。Terraform 自身有大量坑:state 后端选错了多人协作 race condition 损坏 state;module 设计错了就是"另一个 main.tf";workspace 拿来分环境是 Terraform 官方推荐但**已经被社区证伪**的反模式;`terraform import` 没干过的人第一次面对 100 个存量资源会崩溃;Terragrunt 解决了什么、没解决什么,选还是不选,得看团队规模。

backendLearning/58 起步教过 Terraform 怎么写,**这一篇默认你已经会 `terraform init / plan / apply`**——只讲事实标准上"生产级 Terraform"长什么样。读完你应该能:**在白板前讲清楚生产 Terraform 仓库的目录结构、state 锁机制、module 边界、import 流程,以及 Terragrunt 该不该上**。

> 一句话先记住:**Terraform 80% 的事故根因是两件事——state 损坏 和 module 设计错误**。前者是技术问题,后者是组织问题。**这一篇讲清楚这两件事怎么躲**。

---

## 一、State 后端:三种主流方案的取舍

**State 是 Terraform 的命门**(上一篇详谈过)。这里只讲"具体选哪个 backend"——三种主流方案,各有取舍。

### 1.1 S3 + DynamoDB:经典方案

```hcl
terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.40" }
  }
  backend "s3" {
    bucket         = "company-tfstate-prod"
    key            = "infra/network/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "tflock"
    encrypt        = true
    kms_key_id     = "alias/tfstate"
  }
}
```

**优点**:

- **零额外成本**——bucket + table 几乎免费
- **完全自有**——state 在你 AWS 账号里,不依赖第三方
- **AWS 原生加密 / 版本化 / 跨区复制**——基础设施层面就稳

**缺点**:

- **没有 UI**——看 state 要装 Terraform 自己跑命令
- **没有审批流**——CI 跑 apply,人类工程师只能靠 PR review 把关
- **没有变更通知**——谁 apply 了什么,得自己从 CloudTrail 翻

**适用**:**纯 AWS 团队 + 自建 CI / Atlantis + 有 SRE 维护意愿**。**90% 的中型团队就是这套**。

> 关键:**DynamoDB lock 必须开**。不开就会出现:两人同时 apply → 各自的本地 state 互相覆盖 → 云上多出一堆孤儿资源,或者关键资源被双重创建,排查至少半天。这个坑社区里**每年都有新人踩一次**。

### 1.2 Terraform Cloud / HCP Terraform:SaaS 方案

```hcl
terraform {
  cloud {
    organization = "my-company"
    workspaces { name = "prod-network" }
  }
}
```

**优点**:

- **UI 看 state / plan / apply 历史**
- **审批流内置**——Plan 自动跑、人工 approve、apply 触发
- **VCS 集成**——PR 上自动 plan,贴回 GitHub comment
- **Policy as Code**(Sentinel)——拦截高危变更
- **远程执行**——本地不需要装 provider / 跑 plan

**缺点**:

- **付费**——免费版上限 500 资源,生产用就要 $$$
- **2023 HashiCorp 改许可证后**——商业敏感 / 政府项目顾虑
- **跨云项目得放 HashiCorp 这家公司手上**——一个供应商兜底所有 state

**适用**:**愿意付钱省力气 / 团队没有 SRE 自建意愿 / 跨多云 / 监管要求审计**。

### 1.3 Atlantis:自建 PR 流方案

Atlantis 是个开源工具——**装在 K8s 上,监听 GitHub webhook,PR 上自动跑 plan,工程师在 PR 里评论 `atlantis apply` 触发 apply**。

```yaml
# atlantis.yaml(放在 IaC 仓库根目录)
version: 3
projects:
  - name: prod-network
    dir: envs/prod/network
    workflow: prod-workflow
    autoplan:
      when_modified: ["*.tf", "../../modules/**/*.tf"]
      enabled: true
    apply_requirements: [approved, mergeable]

workflows:
  prod-workflow:
    plan:
      steps:
        - init
        - plan
    apply:
      steps:
        - apply
```

**优点**:

- **开源 / 免费**——自己装在自己 K8s 上
- **PR 流强制**——所有 apply 必须经过 GitHub PR 流程
- **state 还是放 S3**——不绑供应商

**缺点**:

- **得自己运维一个服务**——Atlantis 挂了就没人 apply
- **UI 比 TF Cloud 弱**——Atlantis 主要是机器人,不是平台
- **审批 / 通知体系靠 GitHub 自身**——不像 TF Cloud 那么完整

**适用**:**有 K8s 运维能力 / 想完全自有 / GitHub 文化重的团队**。

### 1.4 三选一怎么选

```
团队 < 5 人 / AWS 单云 / 简单需求       → S3 + DynamoDB 起步
团队 5-30 人 / 多云 / 想要 UI 和审批     → HCP Terraform(付钱省事)
团队 5-30 人 / 强 GitOps 文化 / 自建      → Atlantis(自建 PR 流)
团队 > 30 人 / 多产品线 / 政策严         → Spacelift / env0(企业级第三方)
```

**我推荐**:**中型团队从 S3 + DynamoDB + Atlantis 起步**。两年内出大问题再考虑 TF Cloud / Spacelift。**别一上来就 SaaS,你团队对 Terraform 的理解还没到那一步**。

---

## 二、Module 设计的三个原则

**Module 是 Terraform 复用的基本单元**。设计错了,200 个资源全堆在一个 module 里也能跑——但维护噩梦,改一个字段全 plan 一遍。**Module 设计有三条铁律**:

### 2.1 原则一:单一职责

```
✅ 好的 module
modules/
├── vpc/              ← 只管 VPC + Subnet + Route Table + IGW
├── eks/              ← 只管 EKS cluster + node groups
├── rds/              ← 只管 RDS instance + parameter group + SG
└── alb/              ← 只管 ALB + listeners + target groups

❌ 坏的 module(超级 module)
modules/
└── prod-stack/       ← VPC + EKS + RDS + ALB + IAM + DNS,200 个资源
```

**单一职责的检验标准**:这个 module 改一行,**会影响哪些云资源**?

- **好 module**:改 `vpc` module 的 CIDR 计算,只影响 VPC 和子网。
- **坏 module**:改 `prod-stack` 里某个 IAM 字段,**plan 输出 50 个资源都标"无变化但需要 update"**——`depends_on` 链条太长,Terraform 算不清。

> 经验:**Module 的资源数控制在 5-30 之间**。超过 30 个就考虑拆分,超过 100 个铁定要拆。

### 2.2 原则二:输入输出明确

```hcl
# modules/rds/variables.tf
variable "name"              { type = string }
variable "engine"            { type = string }
variable "engine_version"    { type = string }
variable "instance_class"    { type = string }
variable "allocated_storage" { type = number, default = 100 }
variable "vpc_id"            { type = string }
variable "subnet_ids"        { type = list(string) }
variable "allowed_cidrs"     { type = list(string) }
variable "tags"              { type = map(string), default = {} }

# modules/rds/outputs.tf
output "endpoint"     { value = aws_db_instance.this.endpoint }
output "db_arn"       { value = aws_db_instance.this.arn }
output "sg_id"        { value = aws_security_group.this.id }
```

**输入输出的检验标准**:

- **所有可能变的字段都是 variable**,不写死在 resource block 里
- **下游需要的字段都是 output**,不让用户去查 state
- **variable / output 类型显式声明**,不要 `type = any`
- **变量有合理的默认值**,常见配置不需要每次都写

### 2.3 原则三:不要嵌套超过 2 层

```
✅ 可以
envs/prod/main.tf
  └ module "platform" { source = "../../modules/platform" }
       └ modules/platform/main.tf
           └ module "vpc" { source = "../vpc" }      ← 2 层嵌套
           └ module "eks" { source = "../eks" }

❌ 不要
envs/prod/main.tf
  └ module "platform" 
       └ module "stack"
            └ module "network"                       ← 4 层嵌套
                 └ module "vpc"
```

**嵌套深的代价**:

- **变量穿透**——上层加个变量,中间每一层都要透传
- **plan 输出难读**——`module.platform.module.stack.module.network.module.vpc.aws_vpc.this`
- **import 噩梦**——资源地址带 4 层前缀,手写极易错
- **错误信息难定位**——某个 resource 报错,找到具体 module 要扒半天

**经验**:**Root module 调用 child module 是 1 层;child 内部最多再嵌一层 sub-module。再深就考虑扁平化**。

### 2.4 反模式清单

我见过最离谱的 module 设计:

1. **超级 Module**(一个模块管 200 个资源)——已经说过
2. **Module 互相依赖死锁**——module A 要 B 的输出,B 要 A 的输出 → 永远 plan 不出来
3. **不用 versioning**——`source = "git::https://..."` 不带 ref → 别人改了上游你不知道
4. **Module 输入是 `any` 类型**——传错了运行时才炸,IDE 不能补全
5. **Module 内部 hard-code 环境信息**——`tags = { env = "prod" }` 写死,dev / staging 不能复用
6. **Module 写满了 `local-exec`**——把 module 当 Bash 脚本用
7. **Module 输出对象太大**——直接 output 整个 resource(`value = aws_vpc.this`),下游耦合所有字段

**Module 版本化用法**:

```hcl
# 推荐(Git tag)
module "vpc" {
  source = "git::https://github.com/company/tf-modules.git//vpc?ref=v1.3.0"
  ...
}

# 或者(Terraform Registry)
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.5.0"
  ...
}
```

**永远带 `?ref=` 或 `version =`**。不带的下场:上游一改,你的 plan 输出突然全是 diff。

---

## 三、Workspace 不是用来分环境的(Terraform 官方都说错了)

这是 Terraform 社区**最有争议**的一个话题。Terraform 文档早期推荐用 Workspace 分环境,**但社区共识(包括 HashiCorp 自己后来的官方建议)是 Workspace 不该这么用**。

### 3.1 Workspace 是什么

```bash
terraform workspace new prod
terraform workspace select prod
terraform apply
```

**Workspace 的本质**:**同一份 .tf 代码,多份 state 文件**。state 文件路径自动变成 `env:/prod/...`。

### 3.2 为什么 Workspace 分环境是反模式

```
问题 1:代码同一份,环境差异写在哪
  prod 跟 dev 节点数不同 → 代码里 count = terraform.workspace == "prod" ? 5 : 1
  prod 跟 dev 区域不同   → region = lookup({prod="us-east-1", dev="us-west-2"}, terraform.workspace)
  代码越写越像三元运算符迷宫
  
问题 2:风险隔离不彻底
  workspace 只是 state 隔离,Provider 配置 / Backend 配置都共享
  → 误把 dev workspace 当 prod 切错了,apply 直接打 prod
  → "I thought I was in dev" 这类事故年年发生

问题 3:Module / Provider 版本一刀切
  prod 想锁 provider v5.40,dev 想试 v5.45 → 同一份代码做不到
  
问题 4:权限切不动
  Workspace 用同一份 backend → 任何能 apply dev 的人都能 apply prod
  → 权限隔离要靠"额外的 IAM 工程",违背"开箱即用"
```

**根因**:**环境差异不只是变量,是整个上下文**——backend / provider / IAM / 模块版本 / 审批流。Workspace 只隔离 state 一项,不够。

### 3.3 正确的分环境:Root Module + tfvars

```
infra/
├── modules/
│   ├── vpc/
│   ├── eks/
│   └── rds/
├── envs/
│   ├── dev/
│   │   ├── main.tf                ← 调 module,引 dev 配置
│   │   ├── backend.tf             ← dev 专属 backend
│   │   ├── providers.tf           ← dev 专属 provider 配置
│   │   ├── terraform.tfvars       ← dev 专属变量
│   │   └── versions.tf
│   ├── staging/
│   │   ├── ...同上结构...
│   └── prod/
│       ├── ...同上结构...
└── global/                        ← IAM / Route53 等跨环境共享
    └── ...
```

```hcl
# envs/prod/main.tf
module "vpc" {
  source = "../../modules/vpc?ref=v1.3.0"   # 各环境可以锁不同版本

  name           = "prod-vpc"
  cidr           = "10.0.0.0/16"
  azs            = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_nat     = true
  single_nat     = false                     # prod 多 NAT
  tags           = { env = "prod" }
}

module "eks" {
  source = "../../modules/eks?ref=v2.1.0"

  cluster_name    = "prod-cluster"
  k8s_version     = "1.30"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  node_min        = 5
  node_max        = 50
  node_size       = "m6i.xlarge"
}
```

```hcl
# envs/prod/backend.tf
terraform {
  backend "s3" {
    bucket         = "company-tfstate-prod"     # 跟 dev 完全不同的 bucket
    key            = "infra/main.tfstate"
    region         = "us-east-1"
    dynamodb_table = "tflock-prod"
    encrypt        = true
  }
}
```

**这套结构的好处**:

- **环境完全隔离**——backend / provider / IAM 各自独立
- **代码差异显式**——dev 想试新版本就改 dev 的 `?ref=`,不影响 prod
- **权限分层**——CI role 对 dev / prod bucket 权限不同,从源头隔离
- **新人友好**——看代码就知道当前是哪个环境,不用 `terraform workspace show`

**Workspace 适合什么**:**临时实验环境**(`terraform workspace new pr-1234` 给某 PR 起个临时环境,用完销毁)、**多租户场景**(SaaS 给每个客户一个 workspace)。**生产环境永远用 root module + tfvars 分**。

---

## 四、terraform import 实战:把存量资源纳管

**这是 Terraform 实施一年内必撞的一道坎**——团队上 Terraform 之前,云上已经有几百个手点出来的资源。怎么纳管?

### 4.1 import 的两步走

```bash
# 第一步:手写 resource block(空的)
resource "aws_vpc" "main" {
  # 留空,只占位
}

# 第二步:import
terraform import aws_vpc.main vpc-0abc123def456

# 第三步:terraform plan
# 这时 Terraform 会显示"代码里啥都没写,但 state 里有了"
# 输出:vpc-0abc123def456 的所有真实属性

# 第四步:把真实属性补回 .tf
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name = "prod-vpc"
    Env  = "prod"
  }
}

# 第五步:plan 直到 "No changes"
```

**关键点**:**import 不会自动生成代码**。你必须先写 resource block 再 import,然后**手动**把云上属性抄回 .tf。**第四步漏抄一个字段,plan 就会显示"要 update"——这是 import 是否完成的检验标准**。

### 4.2 Terraform 1.5+ 的新姿势:import block

```hcl
# 在 .tf 里直接写 import block(无需 CLI)
import {
  to = aws_vpc.main
  id = "vpc-0abc123def456"
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  # ...
}
```

```bash
terraform plan -generate-config-out=generated.tf
```

**这个命令会自动生成 generated.tf,把云上属性写进去**。Terraform 1.5+ 必备技能。**省了第四步的手抄**。

### 4.3 大批量 import:用 terraformer

`terraform import` 一次只能 import 一个资源。**几百个资源手 import 不现实**。

**terraformer**(GoogleCloudPlatform/terraformer)是社区工具,**一次扫描整个 AWS 账号 / GCP 项目 / Azure 订阅,自动生成 .tf 文件 + 自动 import**:

```bash
terraformer import aws --resources=vpc,subnet,sg --regions=us-east-1
# 生成 generated/aws/vpc/main.tf 等
```

**但 terraformer 不是银弹**:

- **生成的代码风格垃圾**——没有 module 化,变量都 inline
- **依赖关系靠 ID 字符串**——不会自动用 `aws_vpc.main.id` 这种引用
- **得人工 refactor**——生成后还要花一两周整理成生产级代码

**经验**:**terraformer 用来"批量获取属性",refactor 还是人工**。直接用它的输出当生产代码是错的。

### 4.4 import 的踩坑

1. **resource 已存在 plan 又显示 diff**——某个字段抄漏了 / Provider 默认值和云上实际值不一样
2. **import 资源带子资源**(VPC 自带的 default SG / route table)——这些得**单独 import**,Terraform 不会自动连带
3. **import 顺序错乱**——子资源先 import 了,父资源 import 时关联不上 → 先 import 父再 import 子
4. **跨账号 / 跨区域**——provider alias 必须配对,否则 import 找不到资源
5. **import 之后忘 `terraform plan` 检查**——以为完事了,其实代码和云上还有 diff,下次别人 apply 就翻车

---

## 五、Terragrunt:解决了什么、没解决什么

Terragrunt 是 Gruntwork 公司开源的 **Terraform 包装器**。它解决 Terraform 用大了之后的三个痛点:

### 5.1 痛点一:Backend 配置重复

**没 Terragrunt 的世界**:

```hcl
# envs/dev/backend.tf
terraform {
  backend "s3" {
    bucket = "company-tfstate-dev"
    key    = "infra/network/terraform.tfstate"   # 每个目录都写
    ...
  }
}

# envs/dev/eks/backend.tf
terraform {
  backend "s3" {
    bucket = "company-tfstate-dev"
    key    = "infra/eks/terraform.tfstate"       # 又写一遍
    ...
  }
}

# 30 个目录,30 份 backend 配置,bucket / region / encrypt 字段重复 30 遍
```

**有 Terragrunt**:

```hcl
# root.hcl(项目根目录)
remote_state {
  backend = "s3"
  config = {
    bucket         = "company-tfstate-${get_env("ENV")}"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "tflock"
    encrypt        = true
  }
}

# envs/dev/network/terragrunt.hcl
include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../../modules/network"
}

inputs = {
  cidr = "10.0.0.0/16"
  azs  = ["us-east-1a", "us-east-1b"]
}
```

**一份 backend 配置覆盖所有子目录**,key 自动按目录名生成。**DRY(Don't Repeat Yourself)**。

### 5.2 痛点二:多环境批量操作

```bash
cd envs/dev
terragrunt run-all plan         # 把 dev 下所有目录全 plan 一遍
terragrunt run-all apply        # 全 apply
```

**Terraform 自身做不到这个**——必须 `cd` 进每个目录 `terraform apply`。

### 5.3 痛点三:依赖管理

```hcl
# envs/prod/eks/terragrunt.hcl
dependency "vpc" {
  config_path = "../network"
}

terraform {
  source = "../../../modules/eks"
}

inputs = {
  vpc_id     = dependency.vpc.outputs.vpc_id
  subnet_ids = dependency.vpc.outputs.private_subnet_ids
}
```

**EKS 依赖 VPC,Terragrunt 自动**:

- `apply` 时先 apply VPC 再 apply EKS
- `destroy` 时反向顺序
- `plan` 时把 VPC 的 output 喂给 EKS 的 input

**Terraform 自身做不到跨 root module 的依赖管理**——只能在同一个 root module 里用 `module.vpc.outputs`,跨目录就抓瞎。

### 5.4 Terragrunt 没解决什么

- **不替代 Module**——Terragrunt 还是调你的 Terraform module,只是组织代码
- **不解决 State 锁定**——还是用 S3 + DynamoDB
- **不解决 Drift**——还是要 Atlantis / TF Cloud 之类的工具做
- **不解决审批流**——Terragrunt 本身是 CLI,你的 PR 流程还得自己搭

### 5.5 上不上 Terragrunt

```
≤ 3 个环境 / ≤ 10 个 root module → 用不上,Terraform 原生就够
3-10 个环境 / 10-50 个 root module → 强烈推荐 Terragrunt
> 10 个环境 / > 50 个 root module → 必上 Terragrunt 或者 Spacelift / env0
```

**经验**:**Terragrunt 是中型团队的甜蜜区**。小团队增加复杂度不值,大团队会发现 Terragrunt 也不够,还得上 Spacelift 这种更高级的平台。

---

## 六、一份最小生产级配置

下面这份配置我直接抄过来贴在团队 wiki 上过——**它不是完整,是"最小可工作"**。看清楚每一条为什么这么写:

```
infra/
├── modules/
│   └── vpc/
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       └── versions.tf
├── envs/
│   ├── dev/
│   │   ├── network/
│   │   │   ├── main.tf
│   │   │   ├── backend.tf
│   │   │   └── terraform.tfvars
│   │   └── eks/
│   ├── staging/
│   └── prod/
│       ├── network/
│       │   ├── main.tf
│       │   ├── backend.tf
│       │   └── terraform.tfvars
│       └── eks/
└── README.md
```

```hcl
# modules/vpc/versions.tf
terraform {
  required_version = ">= 1.7, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.40" }
  }
}
```

```hcl
# modules/vpc/variables.tf
variable "name" {
  type        = string
  description = "VPC 名字前缀,会用在所有资源 tag 上"
}

variable "cidr" {
  type        = string
  description = "VPC CIDR,/16 起步,不要 /24"
  validation {
    condition     = can(regex("^10\\.|^172\\.|^192\\.168\\.", var.cidr))
    error_message = "CIDR 必须是 RFC 1918 私网段。"
  }
}

variable "azs" {
  type        = list(string)
  description = "AZ 列表,生产至少 3 个"
}

variable "enable_nat" {
  type    = bool
  default = true
}

variable "single_nat" {
  type        = bool
  default     = false
  description = "true = 所有私网 subnet 共用一个 NAT(省钱,但单点);false = 每个 AZ 一个 NAT(贵,但容灾)"
}

variable "tags" {
  type    = map(string)
  default = {}
}
```

```hcl
# modules/vpc/main.tf(只贴关键)
resource "aws_vpc" "this" {
  cidr_block           = var.cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = merge(var.tags, { Name = var.name })
}

resource "aws_subnet" "private" {
  for_each = toset(var.azs)                     # 用 for_each,不要 count

  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.cidr, 4, index(var.azs, each.value))
  availability_zone = each.value
  tags = merge(var.tags, {
    Name = "${var.name}-private-${each.value}"
    Tier = "private"
  })
}

# ... 公网 subnet / IGW / NAT / Route Table 略
```

```hcl
# modules/vpc/outputs.tf
output "vpc_id"             { value = aws_vpc.this.id }
output "private_subnet_ids" { value = [for s in aws_subnet.private : s.id] }
output "public_subnet_ids"  { value = [for s in aws_subnet.public  : s.id] }
output "vpc_cidr"           { value = aws_vpc.this.cidr_block }
```

```hcl
# envs/prod/network/backend.tf
terraform {
  required_version = ">= 1.7, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.40" }
  }
  backend "s3" {
    bucket         = "company-tfstate-prod"
    key            = "network/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "tflock-prod"
    encrypt        = true
    kms_key_id     = "alias/tfstate"
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags { tags = { ManagedBy = "Terraform", Env = "prod" } }
}
```

```hcl
# envs/prod/network/main.tf
module "vpc" {
  source = "git::https://github.com/company/tf-modules.git//vpc?ref=v1.3.0"

  name       = "prod-vpc"
  cidr       = "10.0.0.0/16"
  azs        = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_nat = true
  single_nat = false                      # prod 多 NAT,不省这个钱
  tags       = { team = "platform", costcenter = "infra" }
}
```

**关键取舍**:

1. **Provider 版本锁到小版本号**(`~> 5.40` 表示 5.40 ≤ v < 5.41 ? 注意 ~> 的实际语义)——避免 5.x 中间某个版本破坏行为
2. **default_tags**——所有资源自动打 tag,不用每个 resource 写一遍
3. **for_each 而不是 count**——下文专门讲为什么
4. **validation**——CIDR 必须私网段,从源头拦错配
5. **Module 引用带 `?ref=v1.3.0`**——版本明确,上游不会偷偷影响你

---

## 七、6 个 Terraform 老手都踩过的坑

### 7.1 Provider 版本漂移

```hcl
# 错的
terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }     # 没版本约束
  }
}
```

**后果**:`terraform init` 拉到的版本随机,今天是 5.40,明天可能 5.50。**某天 plan 突然显示所有资源都要 update**,因为 provider 改了某字段的默认 normalize。

**对的**:`version = "~> 5.40"` 或更严的 `version = "= 5.40.2"`。**生产环境锁到补丁号**。

### 7.2 count 改 for_each 破坏 State

```hcl
# 起步用 count
resource "aws_subnet" "private" {
  count = 3
  cidr_block = "10.0.${count.index}.0/24"
}
# state: aws_subnet.private[0], private[1], private[2]

# 几个月后想加 tag,顺便改成 for_each
resource "aws_subnet" "private" {
  for_each = toset(["a", "b", "c"])
  cidr_block = "10.0.${index([..])}.0/24"
}
# state: aws_subnet.private["a"], private["b"], private["c"]

# terraform plan
# → 显示要"销毁 3 个旧的,创建 3 个新的"
# 因为资源地址变了,Terraform 认为是两套资源
```

**避坑**:

1. **新模块直接用 for_each**——不要先用 count 后悔
2. **count 改 for_each 必须用 `moved` block**:

```hcl
moved {
  from = aws_subnet.private[0]
  to   = aws_subnet.private["a"]
}
moved {
  from = aws_subnet.private[1]
  to   = aws_subnet.private["b"]
}
```

Terraform 看到 `moved` 会**只改 state 不动云资源**。**没有 moved block,要么先 `terraform state mv` 几十次,要么真销毁重建**(生产没人敢)。

**为什么 for_each 比 count 好**:

```
count:    资源地址是 [0], [1], [2] —— 中间删一个,后面全 ID 错位
for_each: 资源地址是 ["a"], ["b"], ["c"] —— 删 "b" 不影响 "a" 和 "c"
```

**经验**:**只有"我就是要 N 个一模一样的"才用 count(比如 5 个 EC2 worker)**。有任何"键"概念都用 for_each。

### 7.3 资源 rename 没用 moved block

```hcl
# 改名前
resource "aws_db_instance" "main" {
  ...
}

# 想改成更有意义的名字
resource "aws_db_instance" "prod_orders_db" {
  ...
}
```

**没 moved block 的下场**:`terraform plan` 显示"要销毁 main,创建 prod_orders_db"——**生产 RDS 被销毁重建,数据全没**。

**正确**:

```hcl
moved {
  from = aws_db_instance.main
  to   = aws_db_instance.prod_orders_db
}

resource "aws_db_instance" "prod_orders_db" {
  ...
}
```

`moved` block 自 Terraform 1.1 起官方支持,**是改名最安全的方式**。也可以用 `terraform state mv` 命令,但 `moved` 块写在代码里,team 其他人 pull 后自动应用,**比命令行操作更工程化**。

### 7.4 大 State 文件 plan 慢

State 文件超过 5MB / 资源超过 500 → `terraform plan` 要好几分钟,有时还超时。

**根因**:**Terraform refresh 时要把 state 里所有资源都对云上重新查一遍**。500 个资源 = 500 次 API 调用 = 慢。

**治理**:

1. **拆 State**——按资源类型 / 团队 / 生命周期拆,每个 root module 一个 state,资源数控制在 < 200
2. **`-target` 临时绕**——`terraform plan -target=module.eks` 只 plan 一部分。**但 -target 不要在 CI 里用,只用作本地排查**——会让 state 局部刷新,长期用会积累问题
3. **`-refresh=false`**——跳过 refresh(plan 会快很多),但**承担 state 与现实不一致风险**。只在你确认刚 apply 完、state 是新鲜的时候用
4. **升级 Terraform**——1.6+ 的 plan 性能比 1.0 好很多

### 7.5 sensitive 值泄露到 log

```hcl
resource "aws_db_instance" "main" {
  username = "admin"
  password = var.db_password
  ...
}

output "endpoint" {
  value = aws_db_instance.main.endpoint
}
```

**问题**:`var.db_password` 没标 sensitive,**`terraform plan` 输出和 CI 日志里都会有明文密码**。

**修复**:

```hcl
variable "db_password" {
  type      = string
  sensitive = true              # plan / apply 输出会被打 ***
}

output "endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = false             # endpoint 不敏感
}

output "db_password" {
  value     = var.db_password   
  sensitive = true              # 真要 output 密码也得标
}
```

**但 `sensitive = true` 只防 stdout 输出,不防 State 文件**——**State 文件本身还是明文存密码**。所以 State bucket 必须加密 + IAM 严控访问。

**更稳的方案**:密码用 Vault / Secrets Manager / SSM Parameter Store 存,Terraform 通过 data source 拉,**不让密码进 State**:

```hcl
data "aws_ssm_parameter" "db_password" {
  name            = "/prod/db/master_password"
  with_decryption = true
}

resource "aws_db_instance" "main" {
  password = data.aws_ssm_parameter.db_password.value
  ...
}
```

注意 data source 拉的值**还是会进 State**(Terraform 要 cache 它)。**只能用动态机制**(每次 apply 时 SSM rotation 一次)才彻底。**这个坑大部分团队都没完全堵住,认了**。

### 7.6 depends_on 滥用

```hcl
# 滥用 depends_on
resource "aws_instance" "app" {
  ...
  depends_on = [
    aws_iam_role.app,
    aws_iam_role_policy.app,
    aws_security_group.app,
    aws_vpc.main,
    aws_subnet.private,
  ]
}
```

**根因**:工程师以为"加 depends_on 让 Terraform 知道顺序"——**99% 情况不需要**。Terraform **自动**从 `aws_subnet.private.id` 这种引用推断依赖。

**真正需要 depends_on 的场景**:

```hcl
# 隐式依赖无法推断的情况
# 比如:某 Lambda 需要 SSM Parameter 存在,但 Lambda 代码里硬编码读 SSM,
# Terraform 看不到 Lambda resource block 里有对 SSM 的引用
resource "aws_lambda_function" "app" {
  ...
  depends_on = [aws_ssm_parameter.config]   # 显式声明
}
```

**经验**:**`depends_on` 是补丁,不是默认**。每加一个 depends_on,问自己:**Terraform 是不是真不知道这个依赖?** 99% 答案是"它知道"。

---

## 八、何时不该上 Terraform

**这是被问最多的一个问题**。我直接给一个具体清单:

### 8.1 不该上的场景

```
1. 云资源 < 20 个,且 6 个月内不会增长
   → 控制台点 + Excel 记录就行,IaC 的运维成本反而高

2. 团队 1-2 人,且都不熟 IaC
   → 学习成本超过收益,出事故反而更难修

3. 实验项目 / hackathon / POC
   → 资源生命周期 < 1 周,IaC 拖慢节奏

4. 完全 serverless(只有 Lambda + S3 + DynamoDB)
   → SAM / Serverless Framework 更贴合,Terraform 是大材小用

5. 资源依赖 K8s 内部生态(几乎全部资源都是 CRD)
   → 用 Crossplane(下一篇讲)

6. 业务上根本不需要环境隔离
   → 单环境单账号,IaC 价值打折
```

### 8.2 该上但要谨慎的场景

```
- 团队 3-5 人,云资源 20-100 个 → 上,但只用 root module + tfvars,不要 Terragrunt
- 多云,但每朵云都很小 → 上,每朵云一个独立 state
- 跨账号 → 上,但 provider alias 要规划清楚
```

### 8.3 一定要上的场景

```
- 团队 ≥ 5 人,云资源 ≥ 50 个
- 有 dev / staging / prod 多环境
- 有合规审计要求(SOC2 / ISO 27001 / 等保)
- 经常需要起临时环境(PR 预览 / 客户 demo)
- 多账号 / 多 region / 多云
```

---

## 九、踩坑提醒

1. **不开 DynamoDB lock**——并发 apply 损坏 state,经典开局事故
2. **State bucket 没开版本化**——误删 state 没法恢复
3. **Provider 不锁版本**——某天 plan 全是 diff,因为上游 provider 改了 normalize 行为
4. **Workspace 拿来分环境**——切错环境直接打 prod
5. **超级 Module**(一个 module 200 个资源)——plan 慢、改一行影响全场
6. **count 改 for_each 没 `moved` block**——资源全销毁重建,生产数据没了
7. **资源 rename 不用 `moved` block**——同上
8. **import 之后忘 plan 检查**——以为完事,实际代码和云上还有 diff
9. **`depends_on` 满天飞**——补丁式依赖管理,长期维护噩梦
10. **`-target` 在 CI 里用**——局部 apply 让 state 失同步
11. **密码明文进 State**——State 加密了也不安全,bucket 权限错配就泄密
12. **Terragrunt 用得太早**——3 个环境就上 Terragrunt 是过度工程
13. **Module 没有 versioning**——上游改了你不知道,plan 突然出 diff
14. **新人在 prod 跑 apply 没人 review**——必须强 PR 流
15. **destroy 没加 `prevent_destroy`**——某天某人 `terraform destroy`,生产 RDS 没了

---

## 十、小结

Terraform 是 IaC 这一层**事实标准**,但事实标准不等于无脑用。这一篇核心几条:

1. **State 后端选对**:中型团队 S3 + DynamoDB + Atlantis 起步,别一上来就 SaaS
2. **Module 三原则**:单一职责 / 输入输出明确 / 不嵌套超过 2 层
3. **Workspace 不分环境**:用 root module + tfvars,Workspace 留给临时环境
4. **import 走流程**:resource block → import → 抄属性 → plan 直到无变化
5. **Terragrunt 看规模**:3-10 个环境 / 10-50 个 root module 的甜蜜区
6. **六大坑都遇过**:Provider 锁版本 / for_each 不是 count / moved block 不是命令行 / 大 State 拆 / sensitive 防输出但不防 State / depends_on 是补丁

**Terraform 是工具,但用好 Terraform 是工程能力**。这个工程能力 = 团队 + 流程 + 纪律 + 工具,缺一不可。

---

下一篇:**`26-Pulumi-CDK-Crossplane.md`**——讲完事实标准,聊聊"新一代 IaC":Terraform 的 HCL 不是真编程语言,**Pulumi 让你用 TypeScript / Python / Go 写 IaC**,**AWS CDK 让你用真代码生成 CloudFormation**,**Crossplane 把基础设施变成 K8s 资源跟 GitOps 天然集成**。三者怎么选?哪些团队该换、哪些团队别瞎换?**给一份明确的选型矩阵,不打太极**。
