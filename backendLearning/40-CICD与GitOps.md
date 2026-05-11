# CI/CD 与 GitOps

24 ~ 30 章把代码打包到镜像、跑到 K8s,但中间这一段——**"代码 push 上去之后,怎么自动跑测试、构建镜像、推到仓库、部署到集群"**——一直是空的。这一章把这条链路补齐。

---

## 一、CI 与 CD 到底是什么

| 缩写 | 全称 | 在做什么 |
| --- | --- | --- |
| **CI** | Continuous Integration | 代码合并前自动跑测试、Lint、构建,保证主干随时可发布 |
| **CD-1** | Continuous Delivery | 主干随时**可以**一键部署到生产(发布动作还是人工) |
| **CD-2** | Continuous Deployment | 主干一旦合并,**自动**部署到生产(无需人工) |

> 经验法则:**绝大多数公司做的是 CI + Continuous Delivery**(可一键发布),不是真正的 Continuous Deployment(自动发到生产)。前者已经能解决 80% 的工程效率问题。

---

## 二、一条完整的 CI/CD pipeline 长什么样

```
push / PR
   │
   ▼
┌──────────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐
│ Lint + 单元测试│→│ 集成测试   │→│ 安全扫描  │→│ 构建镜像  │
└──────────────┘  └───────────┘  └──────────┘  └──────────┘
                                                    │
                                                    ▼
                                          ┌────────────────┐
                                          │ 推到镜像仓库     │
                                          └────────────────┘
                                                    │
   ┌────────────────────────────────────────────────┤
   ▼                                                ▼
[ 自动部署到 dev/staging ]                  [ 人工触发 prod 发布 ]
```

每一步失败都阻断后续——**"跑过了"是后续步骤的前置条件**。

---

## 三、主流工具对比

| 工具 | 形态 | 强项 | 弱项 |
| --- | --- | --- | --- |
| **GitHub Actions** | 仓库内置 | 上手快、生态丰富、yaml 简单 | 私有化部署弱(self-host runner 体验一般) |
| **GitLab CI** | 仓库内置 | 与 GitLab 一体化、`.gitlab-ci.yml` 表达力强 | 需要 GitLab |
| **Jenkins** | 自建 | 老牌、插件无所不有、灵活 | UI 老、维护成本高、Groovy DSL 学习曲线 |
| **CircleCI / Travis** | SaaS | 老牌 SaaS、并行能力强 | 国内访问、价格 |
| **Drone / Tekton / Argo Workflows** | K8s 原生 | 容器化、与 K8s 配合好 | 需要 K8s 基础 |
| **Bazel + Buildkite** | 大厂级 | 单仓库巨型 monorepo、增量构建 | 心智负担 |

> 经验法则:**用什么 Git 平台就用对应内置 CI**(GitHub→Actions、GitLab→GitLab CI)。除非有强需求,否则别为 CI 单独运维一套 Jenkins。

---

## 四、GitHub Actions 实战

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '21', distribution: 'temurin', cache: 'maven' }
      - run: ./mvnw -B verify

  build-image:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ github.sha }}
            ghcr.io/${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-dev:
    needs: build-image
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-kubectl@v4
      - run: |
          echo "${{ secrets.KUBECONFIG_DEV }}" > kubeconfig
          export KUBECONFIG=$PWD/kubeconfig
          kubectl set image deploy/api api=ghcr.io/${{ github.repository }}:${{ github.sha }}
          kubectl rollout status deploy/api --timeout=180s
```

要点:

- **`needs:` 串起 job 依赖**,失败立即停
- **`if:` 限制只 main 分支才推镜像**,PR 不污染仓库
- **`environment:` + secrets** 区分 dev / staging / prod 凭据
- **缓存(`cache-from/to`)** 让镜像构建从 5 分钟降到 30 秒

---

## 五、流水线里该跑哪些检查

| 类型 | 工具 | 阻断标准 |
| --- | --- | --- |
| **Lint / 格式** | ESLint / SpotBugs / golangci-lint | error 阻断,warning 不阻断 |
| **单元测试** | JUnit / Vitest / pytest | 一条 fail 就阻断 |
| **覆盖率** | JaCoCo / c8 / coverage.py | 主干 <60% 阻断(项目自定) |
| **集成测试** | Testcontainers + 真 DB | 阻断,但允许慢 |
| **依赖漏洞** | Trivy / Snyk / Dependabot | 高危阻断,中危告警 |
| **镜像扫描** | Trivy / Grype | 高危阻断 |
| **License 检查** | FOSSA / license-checker | GPL 进来阻断商业项目 |
| **Secret 扫描** | Gitleaks / TruffleHog | 提交里有 token 直接阻断 |

> 经验法则:**安全扫描"告警 → 阻断"要分阶段**。一上来就阻断,团队会绕过(`# nosec`),最后等于没扫;先告警 1~2 个迭代,治理后再卡阈值。

---

## 六、GitOps:声明式发布的范式

传统 push 模型:CI 跑完 → kubectl apply 到集群。
GitOps pull 模型:CI 跑完 → 改 Git 仓库里的 manifest → 集群里的 Operator 监听到变化 → 自动同步。

```
开发仓 (代码)              发布仓 (manifest)             K8s 集群
   │                            │                          │
   └─CI 构建镜像→改 image tag───▶│                          │
                                 │  ◀── ArgoCD/Flux 监听 ───┤
                                 │       自动同步           │
```

**好处**:

1. **集群状态全部在 Git**——出问题 `git revert` 就回滚
2. **没有人能直接 `kubectl apply` 改生产**——审计天然
3. **多集群同步**:一个 manifest 仓推多个集群
4. **PR 即发布申请**:Code Review 流程顺带 Approval

主流工具:**ArgoCD**(UI 强、社区大)、**Flux**(轻、CNCF 嫡系)。

---

## 七、ArgoCD 极简认知

```
Application(CRD)
  ├─ 源:Git 仓库 + path
  ├─ 目标:K8s cluster + namespace
  ├─ 同步策略:auto / manual
  └─ 健康检查 + 自愈
```

定义一个 Application:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata: { name: api-prod, namespace: argocd }
spec:
  project: default
  source:
    repoURL: https://github.com/me/manifests
    targetRevision: main
    path: prod/api
  destination:
    server: https://kubernetes.default.svc
    namespace: prod
  syncPolicy:
    automated: { prune: true, selfHeal: true }
```

**`selfHeal: true`** 是 ArgoCD 的杀手锏:**有人手动 kubectl 改了集群,ArgoCD 自动给你改回来**——禁掉旁路操作。

---

## 八、发布策略:别一把全推

| 策略 | 怎么做 | 适合场景 |
| --- | --- | --- |
| **滚动(Rolling)** | 旧 pod 一批一批换 | K8s Deployment 默认,常规迭代 |
| **蓝绿(Blue-Green)** | 旧版本(蓝)与新版本(绿)并存,流量瞬时切换 | 数据库 schema 兼容、需快速回滚 |
| **金丝雀(Canary)** | 先放 5% 流量到新版,观察→放大 | 高风险变更、A/B 灰度 |
| **影子(Shadow)** | 流量复制到新版,但响应丢弃 | 大改重写,不敢直接发流量 |
| **特性开关(Feature Flag)** | 代码先发,功能用 flag 控制 | 业务功能灰度,与发布解耦 |

K8s 里金丝雀和蓝绿大多用 **Argo Rollouts** 或 **Flagger** 来做(原生 Deployment 不够用)。

---

## 九、CI/CD 与 12-Factor 的关系

12-Factor App 里这几条直接决定 CI/CD 容不容易做:

- **Codebase**:一份代码、多个部署环境
- **Dependencies**:依赖显式声明,镜像里 `mvn install` 不能依赖外部状态
- **Config**:配置走环境变量 / 配置中心,不打进镜像
- **Build / Release / Run 三阶段分离**:CI 输出 build,部署组合 build + config 成 release,再 run
- **Disposability**:进程随时可杀可启,支持滚动发布

> 经验法则:**CI/CD 难推动多半是 Config 和 Build 没分干净**。镜像里塞了配置文件 / 构建依赖外部网络 / 测试需要真实第三方账号——这些都得先治。

---

## 十、Spring Boot 项目的标准模板

```
.
├── .github/workflows/
│   ├── ci.yml              # PR 触发:test + build
│   └── release.yml         # tag 触发:推镜像 + 同步 manifest 仓
├── Dockerfile              # 多阶段构建
├── helm/
│   └── api/                # Helm chart
└── manifests/              # 运行时 K8s 资源(被 ArgoCD 监听)
    ├── dev/
    ├── staging/
    └── prod/
```

镜像 tag 推荐:

- **`<git-sha>`**:精确可追溯
- **`<git-tag>`**(如 v1.4.2):语义化版本,生产用
- **`latest`**:开发用,生产**禁用**(歧义)

---

## 十一、常见踩坑

1. **流水线里跑 e2e 还连真生产**:测试数据写脏了,某天就出事故
2. **secrets 写进 yaml 提交**:用 `secrets.*` / Vault / Sealed Secrets / SOPS
3. **缓存不命中**:每次都重新拉依赖,流水线 10 分钟变 30 分钟
4. **每次都全量构建**:monorepo 用增量构建(Bazel / Nx / Turborepo)
5. **生产发布走"人手 kubectl"**:没有审计、没有回滚、出锅找不到人
6. **`latest` tag 当生产版本**:今天的 latest 和昨天的不是同一个,排查炸裂
7. **没有 staging 环境**:dev → 直接 prod,炸点都给用户碰
8. **镜像不可重复构建**:同一 commit 构建出来的镜像内容不一样(时间戳、随机文件)
9. **流水线失败没人管**:每天红一片,大家都习惯了——CI 立刻变形同虚设
10. **回滚靠重建**:回滚应该是 1 分钟内的事,不应该重跑流水线

---

## 十二、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ PR 必跑 CI 才能合 | 主干始终绿 |
| ✅ 镜像用 git-sha 打 tag | 可追溯,不用 latest |
| ✅ secrets 走 secret manager | 别提交进 Git |
| ✅ 安全扫描接进流水线 | Trivy / Gitleaks / Dependabot |
| ✅ dev/staging/prod 三环境 | 配置隔离、凭据隔离 |
| ✅ 生产发布有审批 / 灰度 | 不全量推 |
| ✅ 用 GitOps 管 manifest | ArgoCD/Flux 自动同步 |
| ✅ 回滚是一键操作 | 不重跑流水线 |
| ✅ 流水线<10 分钟 | 慢就缓存、并行、拆 job |
| ✅ 红了立刻修 | 别让"红 CI"成习惯 |

---

## 小结

CI/CD 不是某一个工具,而是**让"代码到生产"这条路自动化、可观测、可回滚**的一套约定。

到这里,从代码 commit、到镜像构建、到 K8s 部署、到生产发布——这条工程主干已经闭环。**但是上线只是开始**——下一章我们看微服务里另一块绕不过去的基础设施:配置中心和注册中心。
