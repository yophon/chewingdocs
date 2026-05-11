# Pulumi / CDK / Crossplane:用真正的代码写基础设施 / K8s 原生 IaC

上一篇讲了 Terraform 的事实标准地位,但有个声音我刻意压住没展开——**Terraform 的 HCL 不是真正的编程语言**。`for_each` / `count` / `dynamic` / `locals` 这套东西,看着像编程但只是 DSL 拼凑出来的"伪编程"。**写过几千行 HCL 的人,都有过同一个想法:"为什么我不能用 TypeScript / Python / Go 直接写这玩意?"**

这一篇就讲三个回答这问题的工具:**Pulumi**(多云 / 真代码 / 跟 Terraform 同一套 Provider)、**AWS CDK**(亚马逊官方 / 真代码 / 编译到 CloudFormation)、**Crossplane**(K8s 原生 / 把基础设施变成 K8s 资源)。**三者各有真实的使用场景,也各有"别瞎换"的边界**——不是新就一定好。

> 一句话先记住:**HCL 不够用是真的痛,但"真编程语言写 IaC"也带来真的代价——抽象过度 / 调试复杂 / Audit 难**。Terraform 的"笨"在大型团队里是一种保护机制——它强迫你把基础设施写得简单直白。**Pulumi / CDK 给你自由,你要先证明你团队驾驭得了这份自由**。

---

## 一、Terraform HCL 的痛点:为什么会有"真代码 IaC"

讲新一代 IaC 之前,得先把 HCL 不够用的具体地方列出来,不然后面没法对比。

### 1.1 不是真正的编程语言

```hcl
# 想根据 var.env 选不同的 instance type
locals {
  instance_type = var.env == "prod" ? "m6i.xlarge"
                : var.env == "staging" ? "t3.large"
                : "t3.small"
}

# 想根据某 list 长度做条件分支?抓瞎
# HCL 没有 if-else statement,只有三元运算符
# 想 try-catch?没有
# 想 return / break / continue?没有
```

### 1.2 循环难写

```hcl
# 想给 10 个 subnet 配不同的 NACL 规则
resource "aws_network_acl_rule" "ingress" {
  for_each = {
    for pair in flatten([
      for subnet in var.subnets : [
        for rule_idx in range(length(var.rules)) : {
          subnet_id = subnet.id
          rule_idx  = rule_idx
          rule      = var.rules[rule_idx]
        }
      ]
    ]) : "${pair.subnet_id}-${pair.rule_idx}" => pair
  }
  # ↑ 三层嵌套 + flatten + 拼 key —— 看一眼想吐
  ...
}
```

**同样的逻辑用 TypeScript 写**:

```typescript
subnets.forEach((subnet, i) => {
  rules.forEach((rule, j) => {
    new NetworkAclRule(`rule-${i}-${j}`, { subnetId: subnet.id, ...rule });
  });
});
```

**清晰程度差一个数量级**。

### 1.3 没有类型检查

```hcl
# variable 类型可以是 any
variable "config" { type = any }

# 调用方传 { instance_type = "m6i.xlarge" }
# 但 module 内部访问 var.config.instnce_type(typo)
# → plan 时才报错,IDE 不告诉你
```

### 1.4 IDE 支持差

主流 IDE(VSCode / IntelliJ)对 HCL 的支持远不如 TypeScript / Python:

- **跳转**——只能跳同文件内,跨 module 跳转得装插件且不稳
- **类型推导**——基本没有,module 输出全靠看文档
- **重构**——改个变量名要全局搜索替换
- **debug**——只能 `terraform console` 临时算表达式,没有断点

### 1.5 测试难

```hcl
# 怎么测一个 module 的逻辑?
# 答:跑 terraform plan,看输出对不对
# → 慢、需要真云凭证、CI 跑要 5 分钟
```

Terraform 社区有 `terratest`(Go 写测试)、`Open Policy Agent`(策略测试),**但跟"用 TypeScript 写单元测试"的体验差远了**。

---

## 二、Pulumi:用 TS / Python / Go 写 IaC

Pulumi 是 2018 年出现的工具,**核心定位**:把 Terraform 同一批 Provider(AWS / Azure / GCP / K8s 等)拿过来用,**但代码用真编程语言写**。

### 2.1 一份最小 Pulumi 示例

```typescript
// index.ts —— TypeScript 写的基础设施
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as eks from "@pulumi/eks";

const config = new pulumi.Config();
const env = pulumi.getStack();                       // 自带 stack 概念,类似 workspace

// VPC —— awsx 帮你算 subnet CIDR / NAT 配置
const vpc = new awsx.ec2.Vpc("main", {
  cidrBlock: "10.0.0.0/16",
  numberOfAvailabilityZones: 3,
  natGateways: {
    strategy: env === "prod"
      ? awsx.ec2.NatGatewayStrategy.OnePerAz
      : awsx.ec2.NatGatewayStrategy.Single,           // 三元运算符,正常的语法
  },
  tags: { Env: env, ManagedBy: "Pulumi" },
});

// EKS 集群
const cluster = new eks.Cluster("main", {
  vpcId: vpc.vpcId,
  subnetIds: vpc.privateSubnetIds,
  instanceType: env === "prod" ? "m6i.xlarge" : "t3.large",
  desiredCapacity: env === "prod" ? 5 : 1,
  minSize: env === "prod" ? 3 : 1,
  maxSize: env === "prod" ? 30 : 5,
});

// RDS —— 用 Pulumi 的 abstraction
const dbSubnetGroup = new aws.rds.SubnetGroup("main", {
  subnetIds: vpc.privateSubnetIds,
});

const db = new aws.rds.Instance("orders", {
  engine: "postgres",
  engineVersion: "16.2",
  instanceClass: env === "prod" ? "db.r6g.xlarge" : "db.t4g.medium",
  allocatedStorage: 100,
  dbSubnetGroupName: dbSubnetGroup.name,
  username: "admin",
  password: config.requireSecret("dbPassword"),       // 自动加密存
  skipFinalSnapshot: env !== "prod",
});

// 输出
export const vpcId = vpc.vpcId;
export const clusterName = cluster.eksCluster.name;
export const dbEndpoint = db.endpoint;
```

```bash
pulumi up                              # 等价 terraform apply
pulumi destroy                         # 等价 terraform destroy
pulumi stack select prod               # 切 stack(类似 workspace 但更彻底)
```

### 2.2 Pulumi 的"真代码"优势

```typescript
// 想给 10 个 microservice 各起一个 SQS queue —— 一个 for 循环搞定
const services = ["orders", "payments", "users", "search", "...10 个"];

const queues = services.map(svc => new aws.sqs.Queue(`${svc}-queue`, {
  visibilityTimeoutSeconds: 300,
  redrivePolicy: pulumi.jsonStringify({
    deadLetterTargetArn: dlq.arn,
    maxReceiveCount: 3,
  }),
  tags: { Service: svc, Env: env },
}));

// 输出每个 queue 的 URL,导出给应用
export const queueUrls = queues.reduce((acc, q, i) =>
  ({ ...acc, [services[i]]: q.url }), {});
```

**用 Terraform 写同样逻辑要嵌套 for_each + 拼 map**——10 行 vs 20 行,可读性差远了。

### 2.3 Pulumi 的 State 和后端

**这里 Pulumi 跟 Terraform 类似但有区别**:

| | Terraform | Pulumi |
| --- | --- | --- |
| State 默认 | 本地 | Pulumi Service(SaaS,免费版有限制) |
| 自建 backend | S3 / GCS / Azure | S3 / GCS / Azure / 本地 / 自建 service |
| 配置存哪 | tfvars 文件 | Pulumi Service / 本地 yaml |
| Secret 加密 | 没原生 | 原生支持(KMS / Vault 集成) |
| 状态锁 | 手配 DynamoDB / GCS 自带 | 自动(Service 或 backend) |

**Pulumi 在 Secret 管理上原生比 Terraform 好**——`config.requireSecret("dbPassword")` 直接加密存,**plan / apply 输出都自动打码**。Terraform 要靠 `sensitive` + 外部 Vault / SSM 组合才能达到同等效果。

### 2.4 Pulumi 的真实痛点

**别只看广告**,Pulumi 也有 Terraform 没有的痛:

1. **生态比 Terraform 小**——招聘市场 / 社区文档 / Stack Overflow 答案 / 第三方 Module,Terraform 都是数量级优势
2. **产品成熟度差一点**——某些 Provider 行为跟 Terraform 同步有延迟,边缘特性不一定支持
3. **抽象层"魔法"多**——`awsx.ec2.Vpc` 自动算 subnet CIDR,自动创建 NAT,**省事但也"看不见"**。出问题时调试比 HCL 难
4. **调试栈深**——TypeScript 写的代码编译成 Pulumi 内部表示再调 Provider,**栈跟踪不直观**
5. **企业版才有的功能**——Policy Pack(像 Sentinel)、SSO、Audit Log 都是收费
6. **跨语言协作差**——团队一个用 TS、一个用 Python,Pulumi 项目本身只能选一种

### 2.5 何时上 Pulumi

```
适合:
  - 团队主力语言是 TypeScript / Python / Go,IaC 想跟应用代码同栈
  - 逻辑复杂(大量循环、条件、抽象),HCL 写起来痛苦
  - 想要单元测试 IaC(Jest / pytest 测 IaC 逻辑)
  - 跨多云 + 想用真编程语言

不适合:
  - 已经在用 Terraform 且没遇到 HCL 痛点 → 别瞎换,迁移成本巨大
  - 团队没有强 TS / Python 文化 → 反而增加学习成本
  - 想用社区 Module / Registry 的生态 → Terraform Registry > Pulumi Package
  - 招聘视角:Pulumi 工程师比 Terraform 难招 50%
```

> 一个常见的误判:"我们 TypeScript 团队,所以选 Pulumi"。**TS 团队不一定就该选 Pulumi**——还要看你的 IaC 复杂度。VPC + EKS + RDS 这种"标配"用 Terraform 反而更省事(社区 module 现成,人人都会读)。Pulumi 真正发挥优势是 IaC 里有大量"业务逻辑"的场景。

---

## 三、AWS CDK:亚马逊官方 / 编译到 CloudFormation

AWS CDK 是亚马逊 2019 年发布的工具——**核心定位**:用 TS / Python / Java / C# 写 IaC,**但最终编译成 CloudFormation 模板**,由 CFN 部署。

### 3.1 一份最小 CDK 示例

```typescript
// lib/network-stack.ts
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as eks from "aws-cdk-lib/aws-eks";
import * as rds from "aws-cdk-lib/aws-rds";

export class NetworkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: cdk.StackProps & { env: string }) {
    super(scope, id, props);

    const isProd = props.env === "prod";

    // VPC —— CDK 的 abstraction 比 Pulumi 还高
    const vpc = new ec2.Vpc(this, "MainVpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 3,
      natGateways: isProd ? 3 : 1,
      subnetConfiguration: [
        { name: "public",  subnetType: ec2.SubnetType.PUBLIC,   cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "db",      subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // EKS —— 一行起一个生产可用的集群
    const cluster = new eks.Cluster(this, "MainCluster", {
      vpc,
      version: eks.KubernetesVersion.V1_30,
      defaultCapacity: isProd ? 5 : 1,
      defaultCapacityInstance: isProd
        ? ec2.InstanceType.of(ec2.InstanceClass.M6I, ec2.InstanceSize.XLARGE)
        : ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.LARGE),
    });

    // RDS —— DatabaseInstance 帮你处理 SG / subnet / secrets
    const db = new rds.DatabaseInstance(this, "OrdersDb", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_2 }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      instanceType: isProd
        ? ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.XLARGE)
        : ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
      allocatedStorage: 100,
      credentials: rds.Credentials.fromGeneratedSecret("admin"),   // 自动生成进 Secrets Manager
      deletionProtection: isProd,
    });

    new cdk.CfnOutput(this, "VpcId", { value: vpc.vpcId });
    new cdk.CfnOutput(this, "DbEndpoint", { value: db.dbInstanceEndpointAddress });
  }
}
```

```bash
cdk synth                          # 编译成 CFN 模板,看一眼
cdk deploy NetworkStack            # 部署
cdk destroy NetworkStack           # 销毁
cdk diff                           # 类似 terraform plan
```

### 3.2 CDK 的"抽象 Construct"分层

CDK 最大的特色是 **三层 Construct**:

```
L1 Construct: CfnXxx —— CloudFormation 一比一映射,字段全暴露
                        cdk.aws_ec2.CfnVpc 等

L2 Construct: ec2.Vpc / rds.DatabaseInstance ——
                  AWS 推荐的"合理默认值",自动处理 SG / IAM / log
                  比 L1 抽象一层,代码量少 50%

L3 Construct (Patterns): aws_ecs_patterns.ApplicationLoadBalancedFargateService
                  一个对象 = 一整套"ALB + ECS + Fargate + 监控 + 日志"
                  代码量少 80%,但完全封装,定制困难
```

**对比 Terraform**:Terraform 只有 L1 概念——一个 resource 对应一个云资源,**没有 L2 / L3 这种抽象**(社区 module 算半个 L2,但没 CDK 这么"原生")。

**CDK 的 L2 是真的省事**:

```typescript
// CDK L2:写 1 行
const db = new rds.DatabaseInstance(this, "Db", { engine, vpc });
```

**Terraform 等价**:你得手写 RDS instance、SG、Parameter Group、Secret Rotation Lambda、Subnet Group、CloudWatch alarm,**至少 50 行 HCL**(或用社区 module,但 module 的版本和默认值你得 review)。

### 3.3 CDK 编译到 CFN 的代价

CDK 不像 Pulumi / Terraform 直接调 API,**它编译成 CloudFormation 模板,再让 CFN 去 apply**。这带来好处也带来痛:

**好处**:

- **AWS 官方支持**,问题报到 AWS support 不被踢皮球
- **跟 CFN 生态打通**——CFN Drift Detection、StackSet、cdk pipelines 一站式
- **Rollback 是 CFN 原生**——apply 失败自动回滚
- **Audit 友好**——CFN 模板可读,可以审计

**坏处**:

- **CFN 自身的限制全继承**——CFN 慢、错误信息晦涩、某些资源更新方式怪
- **状态管理交给 CFN**——你看不到"state file",一切由 CFN stack 隐式管理
- **跨云能力差**——CDK 只能写 AWS。CDK 有 cdktf(编译到 Terraform)和 cdk8s(编译到 K8s YAML),但这两个生态弱很多
- **debug 难**——TS 代码出问题→ synth 报错 → CFN stack 报错,中间隔两层

### 3.4 CDK 的真实痛点

1. **抽象过度**——L2 / L3 帮你做了一堆决定,有时候不是你想要的(比如默认 VPC 自动开了 NAT,生产 dev 全开就 vpc 月底 $$)
2. **escape hatch 不优雅**——想改 L2 内部某字段?要用 `cfnVpc = vpc.node.defaultChild as ec2.CfnVpc; cfnVpc.addPropertyOverride(...)`——丑且脆弱
3. **Stack 不能太大**——CFN 单 stack 资源数上限 500,大型项目要拆 stack,跨 stack 引用变复杂
4. **更新策略 vs 实际**——CDK 编译出的 CFN 模板,某些字段的"update behavior"(替换 / 修改)藏在 CFN 文档里,出问题才发现
5. **Drift 治理弱**——CFN 自带 Drift Detection 但不如 Terraform 灵活,K8s controller 在 CDK 视角下是黑盒

### 3.5 何时上 CDK

```
适合:
  - 全 AWS 栈,没有跨云需求
  - 团队对 CFN 已经熟,想升级到代码
  - 用 AWS 重抽象服务(Step Functions / Cognito / Amplify)—— CDK 是首选
  - 想用 cdk pipelines 一站式 CI/CD

不适合:
  - 多云项目(GCP / Azure 一笔带过的不算)
  - 想要 IaC 跟 K8s 紧密集成 → 选 Crossplane
  - 已经在用 Terraform 且没遇到痛点 → 别换
```

---

## 四、Crossplane:K8s 原生 IaC

Crossplane 是 2018 年出现的工具,**核心定位**:把基础设施(RDS / S3 / VPC)变成 K8s 自定义资源(CRD),**让你用 `kubectl apply` 创建云资源**。

### 4.1 Crossplane 的心智

```
┌──────────────────────────────────────────────────────┐
│ Crossplane = K8s Operator + 云资源 Provider          │
│                                                       │
│  你写:    apiVersion: rds.aws.crossplane.io/v1beta1  │
│           kind: DBInstance                            │
│           metadata: { name: orders-db }               │
│           spec: { engine: postgres, ... }             │
│                                                       │
│  kubectl apply -f db.yaml                             │
│                                                       │
│  Crossplane controller:                              │
│    1. 看到 DBInstance CRD                            │
│    2. 调 AWS API 创建 RDS                            │
│    3. 把 endpoint / credentials 写到 K8s Secret      │
│    4. 持续 reconcile(类似 Deployment controller)    │
└──────────────────────────────────────────────────────┘
```

**关键点**:**基础设施变成 K8s 资源后,可以用 ArgoCD / Flux 同步**——基础设施和应用走同一个 GitOps 流程。

### 4.2 一份最小 Crossplane Composition

Crossplane 的核心抽象是 **Composition + XR(Composite Resource)**——给开发者一个简单 API,后面是复杂 AWS 配置。

```yaml
# 平台团队定义一个 Composition(只暴露 3 个字段)
apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xpostgresqlinstances.platform.acme.io
spec:
  group: platform.acme.io
  names:
    kind: XPostgreSQLInstance
    plural: xpostgresqlinstances
  claimNames:                                  # 开发者用这个 kind
    kind: PostgreSQLInstance
    plural: postgresqlinstances
  versions:
    - name: v1alpha1
      served: true
      referenceable: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                size:
                  type: string
                  enum: [small, medium, large]
                storageGB:
                  type: integer
                  minimum: 20
                  maximum: 1000

---
# Composition —— "size: small" 翻译成什么 AWS 资源
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: postgres-aws
spec:
  compositeTypeRef:
    apiVersion: platform.acme.io/v1alpha1
    kind: XPostgreSQLInstance
  resources:
    - name: db-instance
      base:
        apiVersion: rds.aws.crossplane.io/v1beta1
        kind: DBInstance
        spec:
          forProvider:
            region: us-east-1
            dbInstanceClass: db.t4g.medium       # 默认值,下面被 patches 覆盖
            engine: postgres
            engineVersion: "16.2"
            allocatedStorage: 100
            masterUsername: admin
            autoGeneratePassword: true
            publiclyAccessible: false
            backupRetentionPeriod: 7
      patches:
        - fromFieldPath: "spec.size"
          toFieldPath: "spec.forProvider.dbInstanceClass"
          transforms:
            - type: map
              map:
                small:  db.t4g.medium
                medium: db.t4g.large
                large:  db.r6g.xlarge
        - fromFieldPath: "spec.storageGB"
          toFieldPath: "spec.forProvider.allocatedStorage"
```

**开发者用法(超级简单)**:

```yaml
# dev/orders-db.yaml
apiVersion: platform.acme.io/v1alpha1
kind: PostgreSQLInstance
metadata:
  name: orders-db
  namespace: orders
spec:
  size: medium
  storageGB: 200
  writeConnectionSecretToRef:
    name: orders-db-conn         # 创建好后 connection 写到这个 secret
```

```bash
kubectl apply -f orders-db.yaml
# 几分钟后:
kubectl get postgresqlinstance orders-db -n orders
# READY: True
kubectl get secret orders-db-conn -n orders -o yaml
# 拿到 endpoint / username / password
```

**这就是 Crossplane 给开发者的体验**——**开发者不用懂 RDS 怎么配,只声明"我要个中等规模的 PG"**;**平台团队把"中等规模"翻译成"db.t4g.large + 7 天备份 + 私网"**;**整套东西跟 K8s 应用 yaml 走同一个 GitOps 流**。

### 4.3 Crossplane 跟 GitOps 的天然集成

```
传统 Terraform GitOps:
  基础设施 PR  →  Atlantis plan/apply  →  Terraform State
  应用 PR     →  ArgoCD sync          →  K8s
  两个流程,两个工具,两套权限

Crossplane GitOps:
  基础设施 PR  →  ArgoCD sync          →  K8s(创建 CR)
                                       →  Crossplane controller 调云 API
  应用 PR     →  ArgoCD sync          →  K8s
  同一个流程,同一个工具,同一套权限
```

**这就是 Crossplane 的核心卖点**——**统一控制平面**。基础设施变更和应用变更走完全相同的 GitOps 流程,**这对"重 GitOps 文化"的团队是巨大的简化**。

### 4.4 Crossplane 的真实痛点

听起来太美好,**坑也很多**:

1. **K8s 是必须的**——没有 K8s 就没 Crossplane,小项目不会为了 IaC 上 K8s
2. **Provider 成熟度参差不齐**——AWS Provider 比 GCP / Azure 强很多,小众资源(如 AWS Organizations、Macie)经常没覆盖
3. **状态全在 K8s etcd**——基础设施资源多了 etcd 会膨胀,**etcd 出问题影响整个集群**
4. **Reconciliation 慢**——controller 轮询模式,云资源变更可能要几分钟才被 detect
5. **删 namespace 误删云资源**——`kubectl delete ns orders` 会删掉那个 namespace 下所有 CR,**进而删掉真实云资源**(RDS 没了)。生产场景必须配 `deletionPolicy: orphan`
6. **Composition 学习曲线陡**——patches / transforms / pipelines 这套语法比 HCL 还难懂
7. **跨集群基础设施难管**——一个 K8s 集群管自己的资源还行,管"集群之间的基础设施"(network peering)变扭曲

### 4.5 何时上 Crossplane

```
适合:
  - 已经重度用 K8s + GitOps(ArgoCD / Flux)
  - 平台团队要给开发者抽象出"自助式基础设施"(PaaS 类型平台)
  - 团队接受"K8s 是控制平面"这个心智
  - 资源生命周期跟应用紧密耦合(一个 namespace = 一套基础设施)

不适合:
  - 没 K8s 的项目
  - 资源数量大但跟应用解耦(企业级网络 / IAM / 合规资源)→ Terraform 更适合
  - 团队对 K8s CRD 不熟 → 学习曲线吃不消
  - 跨多云需要丰富 Provider → Terraform 生态完胜
```

> 一个真实场景:有团队用 Crossplane 给开发者提供"自助式 RDS"——开发者提 `kind: PostgreSQLInstance`,几分钟拿到一个 PG。**这是 Crossplane 最闪光的用例**。**但这个团队的基础 VPC / Transit Gateway / IAM 还是用 Terraform**——因为这些"集群外"的资源用 Crossplane 反而别扭。

---

## 五、三者选型矩阵

把决策做成一张表,**直接抄走用**:

| 你的情况 | 推荐 |
| --- | --- |
| 已有 Terraform 且没痛点 | **别瞎换**——迁移成本 > 收益 |
| 团队 TypeScript / Python 强,IaC 逻辑复杂 | **Pulumi** |
| 全 AWS,想要"L2 抽象"省事 | **AWS CDK** |
| 重 GitOps + K8s,想给开发者自助平台 | **Crossplane** |
| 多云 + 招聘容易 + 团队 SRE 文化 | **Terraform** |
| 新项目,团队 5 人以下 | **Terraform**(社区资源最厚) |
| 新项目,团队 30 人以上,有强工程文化 | Terraform / Pulumi 都行,看语言偏好 |
| 想用真编程语言 + AWS 单云 | **CDK > Pulumi**(CDK 抽象更高) |
| 想用真编程语言 + 多云 | **Pulumi > CDK** |
| 已经在 CFN,想升级 | **CDK**(同生态升级) |
| 已经在 CloudFormation YAML 受不了 | **CDK** |

**三者混用的场景也很常见**:

```
基础设施(VPC / 集群 / IAM)    → Terraform
应用层 K8s 资源 + 应用相关云资源 → Crossplane via ArgoCD
单云内业务抽象资源              → CDK(如果全 AWS)
                              → Pulumi(如果跨云)
```

**没有"必须只选一个"的规定**。但**每多一种 IaC 工具,团队就多一份学习成本和维护成本**——加之前问一句:"我团队真的扛得动两套吗?"

---

## 六、真代码写 IaC 的利与弊

把好处和坏处明确写出来,免得听完营销话术就头脑发热:

### 6.1 好处

```
✅ 循环 / 条件 / 抽象 —— 复杂场景写起来像"正常代码"
✅ 类型检查 —— IDE 报错,不用等 plan 才发现
✅ IDE 跳转 / 重构 / 补全 —— 开发效率上一个台阶
✅ 单元测试 —— jest / pytest / go test 测 IaC 逻辑
✅ 跟应用代码同栈 —— 招聘 / Code Review / 工具链统一
✅ 抽象重用 —— 自己写 "Class" 而不是 module
✅ 业务逻辑 —— "给每个客户起一套 stack" 这种需求,真代码写最清晰
```

### 6.2 坏处

```
❌ 抽象过度 —— L2 / L3 Construct 帮你做了一堆决定,出问题难调
❌ 调试复杂 —— TS → Pulumi 内部 → Provider → 云 API,栈深
❌ Audit 难 —— Terraform 的 plan 输出干净,真代码 IaC 的 plan 经常带"看似无关"的 diff
❌ State 复杂度增加 —— Pulumi state / CFN stack 比 tfstate 更黑盒
❌ 招聘市场窄 —— Terraform 工程师比 Pulumi 工程师多 5 倍
❌ 团队驾驭门槛高 —— 真代码 IaC 写出"屎山"比 HCL 更隐蔽
❌ 配套生态弱 —— Atlantis / TF Cloud / 社区 module 都围绕 Terraform 转
```

**最关键的一点**:**HCL 的"笨"在大团队是种保护**——它强迫你写"扁平、明显、容易 review"的代码。**真代码 IaC 的自由度,会让一两个高级工程师写出"小组里没人看得懂"的抽象**,长期维护噩梦。

> 一个反模式:某团队用 Pulumi 写了套"基础设施 SDK",抽象了 6 层 class。3 个月后原作者离职。**新来的人花一个月才搞懂"我要加一个 SG 规则,该在哪个 class 里改"**。这种事用 Terraform 大概率不会发生——因为 HCL 写不出 6 层抽象。

---

## 七、Crossplane 实战:平台工程的范式

Crossplane 最值得展开的不是"它怎么用",**是它代表的范式——平台工程**。

```
没有 Crossplane 的世界:
  开发者要个 RDS    → 提 IT 工单 → SRE 写 Terraform PR → review → apply → 通知开发者
  3 天到 1 周

有 Crossplane 的世界:
  开发者要个 RDS    → 写 1 个 yaml → kubectl apply → 5 分钟拿到
  自助式
```

**这就是平台工程的核心理念**:**平台团队封装复杂度,开发者通过简单 API 自助**。Crossplane 不是唯一实现这个理念的工具,但它最贴 K8s 生态。

**对应到组织里的角色**:

```
平台团队 (3-5 人):
  - 维护 Crossplane 安装
  - 写 Composition / XRD(定义"开发者能用什么 API")
  - 维护 Terraform 管底层(VPC / IAM / 集群本身)
  - 保证抽象的安全性(Composition 里默认私网、加密、备份)

开发者 (其余所有人):
  - kubectl apply 自己应用 + 自己的基础设施 CR
  - 不需要知道 RDS / S3 / Lambda 怎么配
  - 不需要 AWS 控制台权限
```

**这种分工的前提**:**平台团队的抽象要真的封装了复杂度**。如果 Composition 暴露 50 个字段给开发者,**那就是把 Terraform module 用 K8s CRD 重写了一遍,没有解决任何问题**。

**好的 Crossplane Composition 的标志**:

- 暴露给开发者的字段 ≤ 5 个
- 默认配置就是生产可用(私网、加密、备份、监控)
- 开发者不需要懂底层云的任何细节
- 平台升级(改 Composition 默认值)对开发者透明

---

## 八、踩坑提醒

1. **以为"真代码 IaC 就一定比 Terraform 好"**——团队驾驭得了吗?Audit 跟得上吗?抽象不会失控吗?
2. **Pulumi 项目混用多种语言**——一个 stack 用 TS,另一个用 Python,跨 stack 协作变扭曲
3. **CDK 用 L3 construct 不看内部**——一个 ApplicationLoadBalancedFargateService 起出 30 个资源,出问题不知道从哪查
4. **CDK 的 escape hatch**(`addPropertyOverride`)滥用——本意是兜底,变成"L2 抽象失效后到处补丁"
5. **Crossplane 删 namespace 误删云资源**——必须配 `deletionPolicy: Orphan`,否则生产 RDS 一秒蒸发
6. **Crossplane Composition 暴露字段太多**——退化成"用 K8s 重写的 Terraform"
7. **同一个团队三种工具并用**——Terraform + Pulumi + CDK 都有,维护成本爆炸
8. **从 Terraform 迁到 Pulumi 没规划**——以为"几周搞定",实际 6 个月还在迁
9. **CDK stack 不拆**——单 stack 资源数撞 CFN 上限 500
10. **Crossplane Provider 选错版本**——0.x 版本跟 1.x 版本 API 不兼容,升级痛苦
11. **Pulumi state 用免费版 Service**——团队大了出现配额限制,迁回 S3 又一波工作
12. **真代码 IaC 没单元测试**——上了真代码的工具但没写测试,等于只享受坏处不享受好处
13. **抽象层过度自动化**——平台团队给开发者的 API 太"魔法",出问题完全不会调
14. **Crossplane 跟 Terraform 互相覆盖**——一个资源既被 Terraform 管又被 Crossplane CR 创建 → 两个 controller 互相 reconcile,资源闪烁

---

## 九、小结

新一代 IaC 不是"必须选一个",是"看场景选合适的":

1. **Pulumi** —— 真代码 + 多云 + 复杂逻辑的甜蜜区
2. **AWS CDK** —— 全 AWS + L2 抽象省事的甜蜜区
3. **Crossplane** —— K8s 原生 + GitOps + 自助平台的甜蜜区
4. **Terraform** —— 生态最厚 + 招聘最易 + 团队不需要"真代码"魔法的甜蜜区

**最大的反模式不是"选错工具",是"为了换而换"**。Terraform 用了三年没出问题,**别因为看了一个 Pulumi 营销视频就开始迁移**。每次工具迁移都是一年起跳的工程债。

**真代码 IaC 的真正适用场景是"抽象需求"**——你的基础设施跟业务紧密耦合(比如多租户 SaaS 给每个客户起一套 stack)、逻辑复杂(批量、条件、模板),HCL 写起来真的吐血。**没有这种需求,Terraform 就够**。

**Crossplane 是另一种"价值主张"**——它不是"取代 Terraform",是"给平台工程提供 K8s 原生底座"。**判断要不要上 Crossplane 不看 IaC 痛点,看"你团队要不要建一个 PaaS 给开发者用"**。

---

下一篇:**`27-配置管理.md`**——讲完三层 IaC 的"基础设施层",这一篇收尾配置管理:**Ansible 在 K8s 时代还有用吗**(有,管 K8s 之外的)、**配置中心选型**(Nacos / Apollo / Consul / etcd)、**Secret 管理的红线**(不能进 Git / 不能进日志 / 不能进监控)、**Vault / SOPS / Sealed-Secrets / External-Secrets 怎么选**。**Secret 这一块的红线我会讲三遍——这是这一层踩坑最容易出大事的地方**。
