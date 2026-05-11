# IaC 心智:声明式 vs 命令式 / 不可变基础设施 / 状态文件的诅咒

讲 IaC 最大的误区是「我写了一堆 `.tf` 文件,我们就上 IaC 了」——**这种"工具用上了就当文化建好了"的自信是这一层踩坑最多的根源**。我见过太多团队:Terraform 仓库挂在那儿,readme 里写着"所有变更必经 PR",**但生产 RDS 的参数组、IAM 的策略、Auto Scaling 的扩容上限,半年里有 70% 是直接在控制台改的**。代码和现实越走越远,某天某人跑了 `terraform apply`,**几十个资源被"恢复"成了 Git 里那个三个月前的版本——这就是事故**。

backendLearning/58 浅讲过 IaC 是什么、Terraform 怎么起步、Helm 怎么打包应用,**那一篇是入门**。**这一篇只讲心智**——声明式和命令式到底差在哪、不可变基础设施到底要不要、State 文件为什么是 IaC 的命门、Drift 是怎么积出来的、IaC 跟权限和组织结构有什么政治问题。**看完这一篇你应该能在团队里讲清楚:为什么"我们用了 Terraform"不等于"我们做了 IaC"**。

> 一句话先记住:**IaC 不是工具,是一份契约——"基础设施只能通过这个流程改"**。工具(Terraform / Pulumi / Crossplane)只是契约的执行者;**契约本身需要权限、流程、文化、纪律一起兜底**。任何一项缺位,IaC 就退化成"装饰性 Git 仓库"。**这一篇就是讲清楚这份契约的每一条具体内容**。

---

## 一、声明式 vs 命令式:这两件事解决的是完全不同的问题

讲 IaC 心智的第一件事是把这两个概念分清楚——**很多人理解的"声明式 = 写 YAML"是错的**。声明式不是某种语法,是一种"**把目标状态告诉系统,让系统自己算出怎么达成**"的范式。命令式则是"**我告诉系统每一步怎么走**"。

举个最简单的例子。"机房三台机器都装上 nginx" 这件事:

```
命令式(Shell 脚本):
  ssh server1 "apt install nginx && systemctl enable nginx && systemctl start nginx"
  ssh server2 "apt install nginx && systemctl enable nginx && systemctl start nginx"
  ssh server3 "apt install nginx && systemctl enable nginx && systemctl start nginx"

声明式(Terraform / Ansible playbook):
  resource "nginx_install" "all" {
    target_hosts = ["server1", "server2", "server3"]
    state        = "running"
    enabled      = true
  }
```

**差别不在写法,在"再跑一遍会发生什么"**:

```
命令式:
  第一次跑    → 装上了
  第二次跑    → apt install 报"已安装",但脚本不会管这个细节,可能直接报错退出
  第三台挂了  → 脚本卡在第三台,前两台已经动过了,状态分裂
  ↓
  脚本必须自己处理"已存在""部分失败"这些情况——叫"幂等性"
  写 100 行命令式脚本 ≈ 写 100 个 if-else 处理状态

声明式:
  第一次跑    → 算 diff:三台都没装 → 装三台
  第二次跑    → 算 diff:都已经满足 → 不动
  第三台挂了 → 前两台已收敛,第三台标红,下次跑继续从第三台开始
  ↓
  幂等是系统帮你保证的,你只描述"应该是什么样子"
```

**这就是声明式真正的价值**——不是"YAML 比 Bash 优雅",而是**把"幂等""diff 计算""状态收敛"这三件事变成基础设施层的内置能力**,工程师不再写 `if exists then skip` 这种垃圾代码。

但**声明式不是银弹**:

| 场景 | 命令式更合适 | 声明式更合适 |
| --- | --- | --- |
| 一次性数据迁移 | ✅ | ❌(没有"目标状态"概念) |
| 上线后 smoke test | ✅(就是一连串命令) | ❌ |
| 数据库 schema 变更 | 各有取舍 | 各有取舍 |
| 创建 100 台同质 VM | ❌ | ✅ |
| 维持 100 台 VM 长期一致 | ❌(每次跑都炸) | ✅ |
| 故障恢复:重建整套环境 | ❌(人工拼脚本顺序) | ✅(一条命令) |
| 业务逻辑:发邮件、调外部 API | ✅ | ❌(不要硬塞 Terraform `null_resource`) |

**经验**:**Shell / Python 脚本不是"低端的 IaC",它跟声明式工具是分工关系**——一次性动作、CI 流水线步骤、业务工作流用脚本;**基础设施的长期状态用声明式**。两者都用,别拿一种锤子砸所有钉子。

> 看到团队里有人用 Terraform 的 `null_resource` + `local-exec` 调 `curl` 调外部 API,**这就是声明式工具被滥用成了命令式工具**。这类需求该用 Airflow / Argo Workflows / 普通 CI job 跑,**不该塞 Terraform**。

---

## 二、不可变基础设施(Immutable Infrastructure)的真意

「不可变基础设施」也是一个常被误读的概念。我听过的最离谱的解读是"**容器跑起来就不能 docker exec 进去改**"——这只是表象不是定义。

**真正的定义**:**一台服务器 / 一个容器 / 一个资源,一旦"部署"完成,它的状态在生命周期内不再被修改;需要变更时,销毁后重建**。

```
可变(Mutable)的世界:
  机器 A 跑着,出 bug → ssh 上去打 patch → 跑着,但配置改了
  下个月再出 bug   → 又一次 ssh 改
  一年后……
  没人知道 A 现在是什么状态
  → "雪花服务器"(snowflake server),独一无二无法复制

不可变(Immutable)的世界:
  机器 A 跑着,出 bug → 改镜像 / 改代码 → 重新构建一份 → 起 A',流量切过去 → 销毁 A
  机器 A' 跟 A(出生时)100% 一致,只是镜像版本不同
  → 任何机器都可被丢弃和重建
```

**不可变的核心收益不是"性能"或"安全",是"可复现性"**:

1. **环境一致性**:dev / staging / prod 用同一份镜像,"在我这能跑"问题消失
2. **可回滚**:旧镜像还在 registry,回滚就是切流量 + 起旧镜像
3. **故障定位**:出问题直接抓"出生时的镜像 + 当前流量",变量空间小
4. **横向扩容**:Auto-Scaling 起 100 个一模一样的,不用各自打 patch
5. **安全更新**:补丁不是"打到生产机",是"重新烤镜像,滚动重启"

**那 ssh 上去 debug 行不行?** 行,但有规矩:**进去 read-only,看完就退出;任何修改都不能"留下"**。修了配置?把改动反向回 Git 仓库,重新构建镜像,滚一遍。**直接在生产机改完不写回的人,在我团队会被叫去喝咖啡**。

**容器和 K8s 让不可变变得便宜**——以前烤 AMI 一次几分钟,容器 build 几秒钟,Pod 重启秒级。**所以 K8s 时代 mutable 已经没有任何技术理由,只有"我们一直这么干"的惯性理由**。

> 一个反模式:有团队的"金标准镜像"是某个工程师两年前烤的 Ubuntu 18.04,现在大家在这镜像里加东西、改东西、提交回 registry。**这是"镜像版本可变",不是不可变**。正确的不可变是:**每次变更都从一份基础镜像(明确的版本号)开始,用 Packer / Dockerfile 重新烤,产物带新的 tag,绝不 mutate 已有 tag**。

---

## 三、三层 IaC:基础设施层 / OS 层 / K8s 资源层

讲 IaC 心智第三件事:**"基础设施"不是一个层,是三层**。一份 Terraform 写不完所有东西。

```
┌────────────────────────────────────────────────────────┐
│ K8s 资源层(应用调度的世界)                              │
│   Deployment / Service / Ingress / HPA / ConfigMap     │
│   工具:Helm / Kustomize / ArgoCD / Flux                │
│   节奏:每天 N 次,跟随业务发布                          │
├────────────────────────────────────────────────────────┤
│ OS / 镜像层(VM 和容器的内部)                            │
│   操作系统、内核参数、运行时、agent、基线安全配置          │
│   工具:Packer(烤镜像)+ Ansible(配置)+ Chef/Puppet  │
│   节奏:每月、每次安全补丁                               │
├────────────────────────────────────────────────────────┤
│ 基础设施层(云资源)                                     │
│   VPC / Subnet / RDS / EKS / IAM / LB / DNS / S3       │
│   工具:Terraform / Pulumi / CDK / Crossplane          │
│   节奏:每周、按需                                       │
└────────────────────────────────────────────────────────┘
```

**这三层最常见的错误是混在一起做**:

- **Terraform 调 `local-exec` 跑 Ansible 配 OS**——慢、状态不清、CI 流水线无法分层
- **Helm Chart 里写 `resource "aws_s3_bucket"`(通过 Crossplane)**,但 Crossplane 没装好,Helm release 半挂——基础设施失败为什么影响应用部署?
- **应用 Pod 里 init container 跑 `aws cli` 创建 SQS queue**——基础设施变成了应用代码的副作用,谁删了应用谁背锅

**正确的做法是层与层之间靠"接口"通讯**:

```
基础设施层 Terraform apply 完
   ↓ 输出:RDS endpoint / EKS kubeconfig / S3 bucket name
   ↓ 写入:AWS SSM Parameter Store / Vault / Git output

OS 层 Packer build 完
   ↓ 输出:AMI ID / Container image tag
   ↓ 写入:Image registry / SSM

K8s 资源层 ArgoCD sync
   ↓ 读取:上两层的 output
   ↓ 部署:Deployment / Service
```

**每一层独立 Git 仓库 / 独立 State / 独立 CI 流水线 / 独立审批人**。基础设施层归 SRE / 平台团队,OS 层归镜像团队 + 安全,K8s 资源层归各业务线。

**一个最常被问的问题**:为什么 K8s 资源层不直接放 Terraform 写?Terraform 有 kubernetes provider 啊。

**答案**:能,但通常不该。理由:

1. **节奏不匹配**——基础设施每周改一次,K8s 资源每天 N 次,放一起 plan 时间太长
2. **State 文件爆炸**——一个 100 服务的集群,K8s 资源几千个,Terraform State 巨大,plan 慢到不可用
3. **Drift 治理困难**——K8s controller 自己会改资源(HPA / VPA / Operator),Terraform 会一直看到 diff
4. **GitOps 工具更适合**——ArgoCD / Flux 是为 K8s 资源调和设计的,有 Health / Sync / Rollout 等概念

**Terraform 只管"集群本身"(EKS cluster / 节点池 / Addon)**,**集群里的资源交给 ArgoCD**——这是云原生 IaC 的事实分工。

---

## 四、State 文件的诅咒

State 文件是 IaC 这一层最容易翻车的地方,我列三个真实事故——都是我或同事亲历的:

```
事故 A:State 提交到 Git
  某工程师把 .tfstate 提交了
  里面有 RDS 的 master password 明文
  几小时后 GitHub 扫描器(实习生用的 fork)告警
  → 紧急轮换密码 + 审计三个月的 Git 操作

事故 B:并发 apply
  两个工程师同时跑 terraform apply,本地后端
  state 互相覆盖,云上多出 5 个孤儿资源
  → 手动 import 一周

事故 C:State 文件丢了
  CI 配错,backend 没指对 S3 路径
  apply 后 state 写到 /tmp 然后被清理
  → Terraform 不知道云上资源属于谁,plan 出来要"重新创建"全部资源
  → 紧急 import 100 多个资源
```

**这三个事故的共同点:State 不是普通文件,它是"事实的真相"——Terraform 凭它知道"哪个 .tf 资源对应云上哪个真实 ID"**。一旦 State 出问题,Terraform 就完全失去了对世界的认知。

### 4.1 State 必须远程存

```hcl
# 错的(本地 state)
# 默认就是这样,什么都不配
# → state 在 ./terraform.tfstate

# 对的(S3 + DynamoDB lock,AWS 经典)
terraform {
  backend "s3" {
    bucket         = "company-tfstate-prod"
    key            = "infra/network/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "tflock"          # 加锁防并发
    encrypt        = true               # SSE-KMS 加密
    kms_key_id     = "alias/tfstate"
  }
}
```

**为什么 S3 + DynamoDB lock 是 AWS 经典组合**:

- **S3**:版本化(versioning 开启)+ 加密 + 跨区域复制 → State 不丢
- **DynamoDB**:`LockID` 表存"现在谁在 apply" → 防并发
- **IAM**:bucket / table 只允许 CI 角色 + 高级工程师访问 → 防误操作

非 AWS 用户的对应选项:

| 云 | Backend |
| --- | --- |
| GCP | GCS bucket(自带锁) |
| Azure | Azure Storage(自带锁) |
| 多云 / 不绑云 | Terraform Cloud / HCP Terraform / Spacelift / env0 |
| 自建 PR 流 | Atlantis(state 还是要存 S3/GCS,但 apply 流程走 PR) |

### 4.2 State 是事实的真相,代码不是

这一点反直觉但极其重要:

```
.tf 文件:  我想要这样
State:    我现在知道实际是这样(上次我看的时候)
云上现实:  当前实际是这样(可能跟 State 不一样,叫 Drift)

terraform plan = (云上现实) 跟 (.tf 文件) 做 diff
                 但 Terraform 算 diff 时,先信 State 是真的,
                 然后 refresh state 跟云上现实对齐
                 再算 (refreshed state) → (.tf) 的差异
```

**所以**:

1. **State 删了不等于资源删了**——云上资源还在,但 Terraform 不再知道它们存在 → 下次 apply 会重新创建,导致重复资源
2. **直接编辑 State 是高危操作**——除非你知道你在干什么,99% 的"我修一下 state"都是错的
3. **State 是工程团队的核心资产**——比 `.tf` 文件还宝贵,因为 `.tf` 是描述,State 是事实

**State 操作要走的命令**(`terraform state ...`):

```bash
terraform state list                     # 看 state 里有什么
terraform state show aws_vpc.main        # 看某个资源的详情
terraform state mv aws_vpc.main aws_vpc.prod   # rename(不动云,只改 state)
terraform state rm aws_vpc.main          # 从 state 移除(不删云资源!)
terraform import aws_vpc.main vpc-xxx    # 把已存在的资源纳入 state
```

**绝不要**:`vim terraform.tfstate`、`jq` 改完写回去——这两个操作出过的事故能写一本书。

---

## 五、Drift(漂移)的 4 种来源

Drift 就是"代码和现实不一致"。我把它分四种:

```
┌───────────────────────────────────────────────────────┐
│ Drift 来源                                              │
├───────────────────────────────────────────────────────┤
│ 1. 人手动改控制台                                       │
│    "改下 RDS 参数试试"、"加个 SG 规则临时排查"           │
│    占 60% 以上                                          │
├───────────────────────────────────────────────────────┤
│ 2. 工具自动改                                           │
│    AWS Auto-Scaling 改 desired_count                  │
│    AWS Config Conformance Pack 改 SG                  │
│    K8s HPA 改 replicas                                │
│    占 20%,治理方式跟 1 完全不同                        │
├───────────────────────────────────────────────────────┤
│ 3. 资源被外部修改                                       │
│    安全团队改了 IAM 策略                                │
│    DBA 改了 RDS parameter group                       │
│    "我没动 Terraform 的东西啊"                          │
│    占 15%                                              │
├───────────────────────────────────────────────────────┤
│ 4. Provider bug                                       │
│    provider 升级后某字段 normalize 行为变了             │
│    plan 永远显示 diff,实际啥都没变                     │
│    占 5%,最难调                                        │
└───────────────────────────────────────────────────────┘
```

### 5.1 这四种治理方式完全不同

**1) 人手动改 → 治理"人"**

- 撤销控制台写权限,**SRE / 工程师只能读控制台**
- 紧急情况要写权限,**走 break-glass 流程**(临时授予 + 自动撤销 + 审计告警)
- IAM 策略上 Deny 一切 console 写操作,Allow 只给 CI 角色

**2) 工具自动改 → 让 Terraform"接受"这种变化**

```hcl
resource "aws_autoscaling_group" "app" {
  min_size = 3
  max_size = 30
  # 不写 desired_capacity——让 ASG 自己决定

  lifecycle {
    ignore_changes = [desired_capacity, target_group_arns]
  }
}
```

`ignore_changes` 告诉 Terraform "这个字段我不管,变了别告诉我"。**没有这个,每次 plan 都是噪音**。

**3) 外部修改 → 协作流程**

- 跨团队的资源,**Terraform 仓库归属要明确**——RDS 谁管?DBA 还是 SRE?
- 写在 README 顶上:"**这个仓库的资源任何手动改动都会被覆盖,有需求提 PR**"
- 跨团队改动用 Module 暴露 input,让别的团队"通过 PR 改参数",而不是绕过 Terraform

**4) Provider bug → 升级谨慎**

- Provider 版本**锁死**(`version = "~> 5.40"`),不要 `~> 5`
- 升级前在 staging 环境跑 plan,看有没有诡异 diff
- 出 bug 的 issue 报到 provider 仓库,临时用 `ignore_changes` 绕过

### 5.2 Drift 治理的三种姿态

**detect**(发现):定期跑 `terraform plan`(每天 / 每周),plan 输出非空就告警。Atlantis / Spacelift / TF Cloud 都内置。

**reconcile**(强制收敛):发现 drift 后**自动 apply 把现实拉回代码**——激进策略,适合"代码即真理"的成熟团队。

**accept**(接受现实):**手动改的合理,把改动写回代码**(`terraform plan` 显示 diff → 工程师把 .tf 改成跟现实一致 → 再 plan 显示无 diff)。或用 `terraform import` 把"新发现的资源"纳入管理。

> 经验:**新团队从 detect 起步,半年后再上 reconcile**。直接上 reconcile 会引发文化对抗——SRE / DBA / 安全团队的应急操作都被回滚,他们就再也不进 Terraform 了。

---

## 六、IaC 的政治问题

讲 IaC 不讲政治,就是没讲完。**IaC 的 80% 阻力来自组织而不是技术**。

### 6.1 谁有 prod apply 权限

```
极端 A:全员可 apply 生产
  好处:快
  坏处:某天某新人手抖 destroy 生产 RDS
        或者 plan 没看仔细就 apply,资源 ID 错位重建

极端 B:只有 SRE Lead 一人可 apply 生产
  好处:稳
  坏处:Lead 休假就没人能动 → 紧急修复卡住 → 大家又开始手改控制台

主流方案:
  本地 apply → 禁止
  CI 自动 apply → 只有 main 分支的 merge 触发
  CI apply 触发条件:PR 被 2 个人 approve + plan 输出被 review 过
  → "权限 = 流程",不是"权限 = 某个人"
```

### 6.2 Code Review 谁批

**这是 IaC 落地最容易出问题的地方**——基础设施的 PR 该谁批?

```
不该批的:
  - 业务工程师批基础设施 PR(看不懂 IAM policy 的影响)
  - 一个 SRE 自己批自己的(代码评审的本意被破坏)
  - 用机器人批(完全无人监督)

该批的(分层):
  - 普通资源(VPC tag、SG 规则、ConfigMap)   → SRE 2 人 review
  - 高风险资源(IAM、KMS、RDS、VPC peering) → SRE Lead + 安全 review
  - 跨团队资源(共用 IAM role)               → 涉及团队 + SRE
  - 删除任何资源                              → SRE Lead 必批
```

**配置 GitHub CODEOWNERS**:

```
# .github/CODEOWNERS
infra/network/*       @sre-team
infra/iam/*           @sre-team @security-team
infra/rds/*           @sre-team @dba-team
infra/eks/*           @sre-team @platform-team
```

PR 提到 IAM 路径,自动 require 安全团队 review,这是技术能强制的;**剩下的纪律靠流程文档 + 训练**。

### 6.3 紧急修复怎么走

**这是 IaC 实施一年内会反复撞上的问题**:凌晨 3 点生产挂了,SG 规则错配,需要立即改一条规则——走 PR 流程要 30 分钟,On-call 工程师扛不住,**他会去控制台直接改**。

**两种现实主义的方案**:

**方案 A:break-glass**

```
平时:On-call 工程师对 prod 只读
触发 break-glass:
  1. 临时给 oncall 角色 console 写权限(IAM 切换)
  2. 操作全程记录(CloudTrail / 录屏)
  3. 时间窗 1 小时,到期自动撤销
  4. 24 小时内必须 retro:把改动写回 Terraform PR
  5. PR 不补 → 告警 SRE Lead → 上 retrospective
```

**方案 B:hotfix 分支 + 简化 review**

```
紧急 PR:
  - 不要求 2 人 approve,1 人 approve + post-mortem 在 24 小时内补审
  - apply 时间 < 30 秒(Terraform 用 -target 单资源)
  - 提交事故时间戳到一个 hotfix 日志
```

**两种方案各有取舍**——A 更严,B 更快。**关键是事先写进 Runbook,别等事故时现场拍脑袋**。

---

## 七、一个真实的反模式:把 IaC 当 doc 用

我亲见过的一个团队事故,值得每个上 IaC 的人引以为戒:

```
背景:
  团队 30 人,400 个 AWS 资源
  2 年前上的 Terraform
  Terraform 仓库挂在那儿,README 写得漂亮
  但实际运维节奏:
    "改 SG 规则?到控制台改一下,顺便提个 PR 改 .tf 同步一下"
    (PR 经常忘提,或者提了不 apply 只是 merge)

半年后的状况:
  - 30% 的 Terraform 代码跟现实有 diff(.tf 里不存在的 SG 规则一堆)
  - 没人敢跑 `terraform apply` 了——怕一跑就把人手加的规则删了
  - Terraform 仓库变成"文档"——大家看代码理解架构,但不再用它部署
  - 新人接手时:"这个 IAM role 是怎么来的?" "应该 console 加的吧 Terraform 没有"
  - 灾备演练失败:Terraform 起来的环境跟生产差 40%

事故触发:
  安全审计要求把所有 SG 规则收敛
  SRE 跑了 `terraform apply` 想把 .tf 里的状态推上去
  瞬间删了 100 多条人手加的规则
  → 生产应用层故障 4 小时,涉及多个核心业务
```

**这个事故的根因不是技术**——Terraform 本身是好的,流程也设计过。**根因是文化和纪律没有跟上工具**:

1. 控制台写权限没收(组织阻力,DBA / SRE 都不愿意)
2. 没有定期 drift detect(没人跑 plan)
3. PR 流程是"软"的,没强制(没 CI 卡住手改)
4. 应急流程没设计(凌晨改完没回写 IaC)
5. 灾备演练没真跑(漂移积累没暴露)

**收尾**:这个团队后来花了 3 个月做"IaC 重建"——把所有现存资源 import 进 Terraform,把控制台写权限收掉,build break-glass 流程,加每日 drift 检测。**这 3 个月本质上是"补 2 年没补的 IaC 文化"**。

---

## 八、IaC 心智的 checklist

把这份贴到团队 IaC onboarding 文档第一页:

### 心智层

- [ ] 团队**明确区分**声明式 / 命令式,不把 Terraform 当脚本
- [ ] **不可变基础设施**作为默认——任何变更都走"重建"而不是"在线改"
- [ ] **三层分层**:基础设施 / OS / K8s 资源 各自独立 Git + State + CI
- [ ] **K8s 资源不放 Terraform**,放 ArgoCD / Flux

### State 安全

- [ ] **生产环境 State 必须远程存**,本地 State 只在玩具项目
- [ ] **State 加锁**(DynamoDB / GCS / Azure Storage 内置)
- [ ] **State 加密**(SSE-KMS / CMEK)
- [ ] **State bucket 版本化**,误删能恢复
- [ ] **State 不进 Git**,`.gitignore` 写死
- [ ] 团队成员**理解 `terraform state` 子命令**,不直接编辑 State 文件

### Drift 治理

- [ ] **定期 drift detect**(至少每周,生产建议每天)
- [ ] **自动管理字段用 `ignore_changes`**(ASG desired、tag 等)
- [ ] **Drift 报告有人看**——不是发个邮件就完了
- [ ] 长期 drift 走"补 PR + apply"路径,**绝不在控制台改回去**

### 权限和流程

- [ ] **控制台写权限收敛**,默认只读
- [ ] **break-glass 流程定义清楚**,临时授权 + 自动回收 + 审计
- [ ] **PR 流程强制**:CI 跑 plan + 2 人 review + main merge 触发 apply
- [ ] **CODEOWNERS 分层**:高风险资源需要安全 / DBA 额外 approve
- [ ] **紧急修复路径有 Runbook**,不要现场临时决定

### 文化

- [ ] **任何手改控制台的操作必须补 PR**,补不上的告警到 Lead
- [ ] **新人 onboarding 包含 IaC 心智培训**,不只是教 `terraform init`
- [ ] **灾备演练真跑**(用 Terraform 起一套等同生产的环境)
- [ ] **IaC 仓库不是文档**,是部署源——确保每条代码都被 apply 过

---

## 九、踩坑提醒

1. **以为"上 Terraform 就是上 IaC"**——工具 ≠ 文化,纪律 + 流程 + 权限缺一不可
2. **把 Terraform 当 Bash 用**(`null_resource` + `local-exec` 调 API)——这是声明式工具被滥用
3. **不可变基础设施只做表面**(ssh 上去改了不写回)——还是雪花服务器,只是包装了一层
4. **三层 IaC 混在一起做**(Terraform 直接管 K8s Deployment)——节奏不匹配 / State 爆炸 / Drift 难治
5. **State 提交到 Git**——密钥泄露,经典事故
6. **本地 apply 不上锁**——并发 apply 损坏 State
7. **不做 drift detect**——半年后 IaC 跟现实差几十个百分点
8. **`ignore_changes` 不会用**——ASG 自动改的字段一直在 plan 里冒红
9. **删资源不走 PR**——某天某人 `terraform destroy -target=...`,生产 RDS 没了
10. **不区分高风险 / 低风险 PR**——所有 PR 都一个 review 标准,关键资源没人盯
11. **紧急修复没流程**——出事就回到控制台手改,IaC 的纪律一次次被撕开
12. **不练灾备**——平时 IaC 没问题,真出事时发现 Terraform 起不出来一套等同环境
13. **State 文件丢了没备份**——bucket 版本化没开,误删一次半天恢复
14. **跨团队 Module 不暴露 input**——别的团队改不动只能绕过 IaC
15. **新人没 onboarding**——半年后他还在控制台改东西,因为没人告诉他不可以

---

## 十、小结:IaC 是一份组织契约

回到开篇那句话:**IaC 不是工具,是一份契约**。

这份契约包含:

1. **声明式优先**——基础设施的"目标状态"由代码描述,Terraform / Pulumi / Crossplane 负责收敛
2. **不可变基础设施**——一旦部署不再原地修改,所有变更通过"重建"完成
3. **三层分层**——基础设施 / OS / K8s 资源各自独立,通过接口通讯
4. **State 是事实的真相**——远程存、加锁、加密、版本化、不进 Git
5. **Drift 持续治理**——定期 detect、合理 reconcile / accept、紧急路径有流程
6. **流程和权限兜底**——控制台收权、PR 强制、CODEOWNERS 分层、紧急修复 break-glass

**任何一项缺位,IaC 都会退化成"装饰性 Git 仓库"**——代码看着漂亮,现实越来越乱,直到某天踩一个大事故,团队才意识到这两年的 Terraform 仓库其实是个 Potemkin Village(波将金村,只有门面的假村庄)。

**IaC 真正落地的标志不是"有多少行 .tf 代码",是"任何一个基础设施变更,你能在 PR 列表里找到对应的那条 commit"**。

---

下一篇:**`25-Terraform深入.md`**——这一篇讲心智,**下一篇讲事实标准的具体落地**:State 后端怎么选(S3 + DynamoDB vs Terraform Cloud vs Atlantis)、Module 设计的三个原则、Workspace 为什么不是用来分环境的(Terraform 官方都说错了)、`terraform import` 实战、Terragrunt 解决什么、6 个 Terraform 老手都踩过的坑(count 改 for_each / 资源 rename / sensitive 泄露到 log / depends_on 滥用)。**Terraform 是 IaC 这一层最实用的工具,这一篇是这层最长的一篇,准备好咖啡**。
