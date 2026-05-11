# CI/CD 心智:为什么 CI 必须快 / 流水线分层 / 制品 vs 部署

第四层「CI/CD 与发布工程」开篇,先把 CI 和 CD 这两个词捋清楚——**这两个字母的混淆是中型团队发布事故 80% 的认知根因**。backendLearning/40 起步讲过一条 CI/CD 流水线长什么样,**那篇是工具视角**——告诉你 GitHub Actions / GitLab CI 怎么写。**这一篇是工程视角**——告诉你为什么一条 30 分钟的 CI 流水线会把整个团队的工程纪律毁掉,为什么 dev / staging / prod 用三份不同的镜像构建是反模式,为什么 flaky test 不修是技术债的一种最贵的形式。

> 一句话先记住:**CI 必须 < 10 分钟,> 30 分钟团队会绕过它**。这不是品味问题,是人性——一条 30 分钟的 CI 等于"工程师改一行代码要等半小时才能 merge",**这种延迟会被人本能地绕过**:本地跳过测试、push 完去开会回来再说、急了直接 `--no-verify`。一旦绕过形成习惯,CI 这层防线就废了。**CI 的核心 KPI 不是"覆盖率",是"延迟"**——10 分钟是分水岭,5 分钟是健康线,< 2 分钟是奢侈品。这一篇所有的工程取舍都围绕这条线展开。

---

## 一、CI 和 CD 不是一回事——这是 80% 团队第一个搞错的事

「CI/CD」连着写久了,大家以为这是一件事。**根本不是**。这两件事的目标、节奏、风险都完全不同,把它们写在同一个 pipeline 里"一键全走"是最常见的反模式。

### 1.1 CI 与 CD 各自在做什么

```
CI = Continuous Integration                   CD-1 = Continuous Delivery
  目标:让代码能 merge                          目标:让制品能随时上线
  输入:代码 diff                               输入:已通过 CI 的制品(镜像)
  输出:"可合并 / 不可合并"的判定                输出:"可发布 / 不可发布"的判定
  动作:lint / unit / integration / build      动作:promote / deploy / 灰度 / 回滚
  节奏:每个 PR 跑、每次 push 跑                节奏:按发布窗口 / 按需触发
  失败代价:开发者多等几分钟                    失败代价:用户看到错
  关心的指标:延迟、稳定性、覆盖率              关心的指标:MTTR、Change Failure Rate

CD-2 = Continuous Deployment(更激进的一种 CD)
  目标:主干 merge 即上生产
  风险:没有人工拦截,bug 直达用户
  适用:Netflix / Etsy 这类高频小步发布团队 + 完整的渐进发布 + 自动回滚 + Feature Flag
  不适用:绝大多数中型团队
```

**国内 95% 的团队"做的 CD"是 Continuous Delivery,不是 Continuous Deployment**。把 CD 理解成"代码 push 自动上生产"就是把自己往悬崖边推——你既没有完整的渐进发布工程,也没有自动 rollback 的能力,这种 CD 不是工程进步是赌博。

### 1.2 为什么 CI 和 CD 必须解耦

```
反模式:CI 和 CD 一条 pipeline 串到底

    push → lint → unit → integration → build → push image → deploy dev → deploy staging → deploy prod
                                                                                           ▲
                                                                                           │ 哪一步挂了整条挂

后果:
  - 改一行业务代码,要等 deploy staging 跑完才知道这次能不能合
  - deploy staging 出问题,所有人 PR 卡住
  - "因为 staging 环境有问题所以 unit test 跑不了"——荒谬但常见
  - CI 时长被 CD 拖累,从 5 分钟变成 25 分钟
  - merge 队列堵起来,工程师开始走"跳过 CI"小路

正确:CI 和 CD 是两条 pipeline,一份制品衔接

    PR  → CI 流水线 →   pass/fail
                       │ pass
                       ▼
    merge → CI 流水线 → 构建制品 → 推 registry → 触发 CD
                                                  │
                                                  ▼
                          CD 流水线 → 部署 dev → 自动测试
                                             ↓ 通过
                                             部署 staging → 烟雾测试
                                             ↓ 通过
                                             部署 prod (人工审批 / 灰度)
```

**两条 pipeline 之间靠"制品"耦合**——CI 产出一个不可变的镜像 hash,CD 拿这个 hash 去各环境部署。**这是后面"Build once, deploy many"的基础**。

### 1.3 反对的两种叙述

我特别反感两种 CI/CD 讲法,这篇绝对不会这么写:

1. **"CI/CD 是 DevOps 文化的体现"**——空话。文化要落到流水线分层、延迟预算、制品 promotion 流程上,不然只是口号。
2. **"上 GitLab CI 就完事了"**——工具不解决问题。同一份 GitLab CI,有的团队用得 MTTR 半小时,有的团队半天搞不定一个 rollback——区别在 pipeline 怎么设计、怎么分层、什么时候不该跑什么。

---

## 二、为什么 CI 必须 < 10 分钟:延迟是 CI 的命门

这是这一篇最重要的一节,**也是中型团队最容易忽略的一节**。

### 2.1 CI 延迟和工程师行为的关系

```
CI 时长       工程师行为                                  CI 这层防线的状态
─────────────────────────────────────────────────────────────────────────
< 2 分钟    push 完不离开工位,等结果                  健康,CI 真在拦 bug
2-5 分钟    push 完去倒杯水,回来看结果                健康
5-10 分钟   push 完切去另一个 PR / 写文档              亚健康,context switch 增加
10-30 分钟  push 完去开会,回来已经忘了改的什么        危险,开始有人本地跳过
> 30 分钟   push 完吃午饭,中午回来发现挂在第 27 分钟  CI 已废,有人用 --no-verify
```

**这不是夸张**。我见过一个团队的 Java 微服务 CI 跑 42 分钟——结果:

- 工程师习惯一次提交 3-5 个无关的修改一起跑 CI(摊薄等待时间)
- 上 CI 之前自己本地跑过测试,**结果 CI 在远程环境一样的代码居然过不了**(本地 vs CI 环境不一致)
- 周五下午没人敢 push(下班前跑不完)
- 一旦 CI 挂在某个 flaky test,工程师直接 "Restart" 一遍,跑 84 分钟
- **整个团队的 PR 周转时间从平均 1 天涨到 3 天**——CI 拖死了发布节奏

### 2.2 一条 CI 流水线的延迟来自哪里

```
典型一条 Java/Go 服务 CI 流水线(没优化):
   checkout                      30s
   依赖解析(maven / go mod)     60-300s   ← 大头,且最容易优化
   lint / format                 30s
   unit test                     60-600s   ← 大头,跟代码规模相关
   integration test              120-900s  ← 大头,起容器/起数据库慢
   build image                   60-300s   ← 大头,FROM 拉镜像 / 多阶段构建
   push image                    30-120s
   ──────────────────────────────────────────
   合计可能 8-40 分钟
```

**优化优先级**:

```
1. 缓存依赖     ← 影响最大,5 分钟省到 30 秒
2. 并行 jobs    ← unit / lint / build 同时跑,串行变并行
3. 拆 PR-time 和 merge-time(下一节讲)
4. 容器分层缓存(buildx --cache-from)
5. 单测里的"慢测试"挪到集成测试
6. integration test 用 testcontainers,不要起整个 K8s
7. 自托管 runner(SaaS runner 慢且贵)
```

### 2.3 缓存策略的取舍

```yaml
# 反例:每次都重新下依赖
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - run: mvn test                    # 每次都下 200MB 的依赖

# 正确:缓存 .m2 / node_modules / .cache
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          cache: 'maven'                 # 内置 maven 缓存
      - run: mvn -B -T 4 test            # -T 4 = 4 线程并行
```

**关键取舍**:

- **缓存 key 用 lock 文件 hash**(`hashFiles('**/pom.xml')`)——`pom.xml` 不变直接命中,否则重新下
- **缓存命中率 < 80% 就是反模式**——key 设计错了,每次都 miss
- **不要缓存 build 输出**——可能引入"明明改了代码但跑的是旧 class"的诡异 bug
- **缓存大小有上限**(GitHub Actions 10GB / repo),超了 LRU 淘汰

### 2.4 一个特别讨厌的反模式:在 CI 里跑 E2E

```
反例:每个 PR 都跑全套 E2E
   PR → unit (3min) → integration (5min) → e2e (20min)  ← 把 e2e 拖进 PR
                                            ▲
                                            │ 这 20 分钟里前端起 / 后端起 / DB 灌数据
                                            │ 任何一环 flaky,整个 PR 重跑

后果:
  - PR 周转时间 30 分钟起步,工程师本能绕过
  - E2E flaky 率天然高(浏览器、网络、时序)
  - 一个 PR 改了 README,跑了 25 分钟 E2E,过了
  - 真正改了核心代码的 PR 反而被 flaky E2E 卡住

正确:E2E 不进 PR,挪到 merge-time 或 nightly
```

**E2E 测试是"上线信号"不是"合并门禁"**——它该出现在 staging 环境,不是 PR pipeline。下一节专门讲流水线分层。

---

## 三、流水线分层:不同的 trigger,不同的延迟预算

把 CI 看成一个"无差别 pipeline"是反模式。**正确的姿势是按 trigger 分层,每层有不同的延迟预算和检查粒度**。

### 3.1 四层流水线

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                        CI/CD 流水线分层                                          │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   层级           触发           延迟预算    跑什么                                 │
│  ──────────────────────────────────────────────────────────────────────────    │
│   commit-time    git push       < 30s      pre-commit hook                     │
│   (本地)                                   - format / lint / 拼写              │
│                                            - 大文件 / 密钥扫描                  │
│                                            - 受影响包的 fast 单测              │
│                                                                                │
│   PR-time        open PR /      < 5min     - 全量 lint + format                │
│   (远程)         push to PR                - unit test                         │
│                                            - 小型 integration test             │
│                                            - 镜像构建(不推送)                │
│                                            - SAST 静态扫描                     │
│                                                                                │
│   merge-time     merge to main  < 15min    - 完整 integration test             │
│   (远程)                                   - 跨服务 contract test              │
│                                            - 镜像构建 + 签名 + 推 registry      │
│                                            - SBOM 生成 + 漏洞扫描              │
│                                            - 自动部署 dev                      │
│                                                                                │
│   release-time   tag / nightly  分钟-小时  - 完整 E2E test                     │
│   (远程)                                   - 性能基线对比                      │
│                                            - 安全 DAST 扫描                    │
│                                            - 部署 staging → 灰度 prod          │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

**这张图是这一篇的灵魂**。每一层的延迟预算不一样,工程师对每一层的耐受度也不一样:

- **commit-time**:本地 hook,30 秒以上工程师会 disable 它,所以只能跑最快的检查
- **PR-time**:工程师在等结果,5 分钟是甜蜜区,超过 10 分钟开始 context switch
- **merge-time**:已经 merge 了没人盯着,15 分钟内出结果就行,失败可以告警
- **release-time**:发布是一个事件,长一点可以接受,但要给"发布窗口"准备出来

### 3.2 commit-time:pre-commit hook 的真实定位

```yaml
# .pre-commit-config.yaml(用 pre-commit 工具)
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
        args: ['--maxkb=500']            # 大文件拦截,防误传二进制

  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks                     # 密钥扫描,这条是红线

  - repo: local
    hooks:
      - id: go-fmt
        name: gofmt
        entry: gofmt -l -w
        language: system
        files: \.go$
```

**关键取舍**:

- **pre-commit 不是 CI 的替代品**——它跑得快但跑得少,只能拦"最低级错误"
- **不要在 pre-commit 里跑 unit test**——慢,工程师会 `git commit --no-verify` 跳过
- **gitleaks / detect-secrets 必须有**——这是"密钥进 Git"的最后一道防线
- **CI 必须再跑一遍 pre-commit**——本地能被绕过,远程不能

### 3.3 PR-time 和 merge-time 的关键区别

这是最容易被忽略的分层。**两者跑的检查不一样,不要混在一起**:

```
PR-time 的目标:让 PR 能不能 merge 可判定
  - 单测必须过
  - 小型 integration 必须过(只起 DB,不起整个生态)
  - lint / format / SAST 必须过
  - 镜像构建必须能成(但不推 registry)
  
  失败代价:开发者改代码再 push

merge-time 的目标:产出可发布的制品 + 启动 CD
  - 完整 integration(起 Kafka / Redis / 外部依赖 mock)
  - 跨服务 contract test
  - 镜像构建 + 签名 + push
  - SBOM + 漏洞扫描
  - 自动部署 dev 环境
  
  失败代价:回滚 merge 或快速修复
```

**反对的模式**:PR-time 全跑了一遍,merge-time 又跑一遍同样的东西——浪费时间且不产出新信号。**正确**:PR-time 是"能不能合"的判定,merge-time 是"产出制品 + 部署 dev"的动作,两者职责不同。

### 3.4 release-time:发布是个事件,不是个 push

```
反模式:每次 merge 到 main 就自动上 prod(没有渐进发布)
   - 凌晨某个工程师改了一个"无关紧要的小 bug"
   - merge 后自动部署 prod
   - 真出问题,凌晨 3 点告警群炸
   - 没人值班,因为大家以为"merge 不上 prod"

正确:release-time 是一个独立的发布事件
   - 由人触发(tag / approve / 按钮)
   - 跑完整 E2E + 性能基线
   - 部署 staging,跑烟雾测试
   - 灰度 prod(下一篇 21 讲)
   - 监控关键指标自动判断是否继续灰度
```

**这一节的精髓**:**不同 trigger 的 pipeline 是不同的工程问题**。把它们捏在一起,既慢又脆,且失去信号区分度。

---

## 四、制品 vs 部署:Build once, deploy many

这是 CI/CD 工程里最重要的一条原则,**没有之一**。

### 4.1 反模式:每个环境重新构建

```
反模式:
  PR    →  build dev image     →  deploy dev
  merge →  build staging image  →  deploy staging
  tag   →  build prod image     →  deploy prod

问题:
  - 同一份代码,构建了 3 次,产出 3 个不同的镜像 hash
  - dev / staging / prod 实际跑的可能是"非常像但不一样"的二进制
  - dev 过了 staging 挂了,因为 staging 多装了一个 patch
  - prod 出了 bug 用 dev 镜像没法复现,因为不是同一个镜像
  - 镜像构建是脆弱步骤,重复 3 次失败概率 ×3
  - "在我机器上是好的,在 prod 上挂了"——这就是 prod 环境构建的下场
```

### 4.2 正确:Build once, promote everywhere

```
正确:
  merge → build 一个镜像 myapp:sha-abc123 → 推 registry
                       │
                       │ 同一个 hash
                       ▼
  deploy dev      使用 myapp:sha-abc123
  deploy staging  使用 myapp:sha-abc123       (跑过 dev 的同一份镜像)
  deploy prod     使用 myapp:sha-abc123       (跑过 staging 的同一份镜像)

  环境差异通过 ConfigMap / Secret / 环境变量注入,
  镜像本身完全相同。
```

**这个原则的工程价值**:

1. **可复现性**——prod 出 bug,本地拉同一个 hash 镜像就能复现
2. **可信度**——staging 通过的就是 prod 要跑的,不是"差不多"
3. **可追溯**——`kubectl describe pod` 看到的 image hash 能精确对应一个 git commit
4. **审计友好**——SBOM / 签名只做一次,全环境复用

### 4.3 怎么落地:tag 策略

```
镜像 tag 策略(推荐):
  myapp:sha-abc123def    ← 永久 tag,git commit short hash
  myapp:1.4.2            ← 语义化版本,release 时打
  myapp:dev / staging / prod  ← 浮动 tag(不推荐,见下)

部署时引用方式:
  ❌  image: myapp:latest              ← latest 是反模式,见踩坑章节
  ❌  image: myapp:dev                 ← 浮动 tag,昨天的 dev 和今天的 dev 不是同一个
  △   image: myapp:1.4.2              ← 可以,但不够精确
  ✅  image: myapp:sha-abc123def       ← 最优,精确到 commit
  ✅  image: myapp@sha256:abcd...      ← 用 digest pin,连 registry 篡改都防得了
```

**关键**:**所有环境的 image 字段引用同一个 sha tag,而不是浮动 tag**。GitOps 的 promote 流程(下一篇讲)就是修改某个环境的 manifest,把 image 字段从一个 sha 改成另一个 sha,本质上是个 git commit。

### 4.4 环境差异放在哪

```
镜像里:代码 + 运行时(JDK / Node / Go binary)
        共享库
        默认配置
        启动脚本

容器外:数据库连接串
        外部 API 地址
        Feature flag
        日志级别
        Secret(DB 密码 / API Key)
        资源限制(CPU / 内存)
```

**容器内的东西在所有环境完全相同,容器外的东西随环境注入**。这就是十二要素应用(12-factor app)的 "Config" 原则——**配置和代码分离**。

**反例**:Dockerfile 里 `ENV DB_HOST=prod-db.example.com`——把环境信息烤进镜像,Build once 立刻破功。

---

## 五、测试金字塔:别让 E2E 占 80%

```
       ╱╲
      ╱E2╲           少量,高价值
     ╱  E ╲          - 关键用户路径
    ╱──────╲         - 跨服务最终验证
   ╱        ╲
  ╱ 集成测试 ╲       适量
 ╱            ╲      - 服务内多模块协同
╱──────────────╲     - 跟数据库 / 中间件交互
╱                ╲
╱   单元测试      ╲   大量,快
╱                  ╲  - 函数级 / 类级
────────────────────  - 跑得快,< 1ms/case
```

### 5.1 数量比例的实战参考

```
单测      :  集成  :  E2E
70-80%    :  15-20% :  5-10%

10 万行代码服务的数量参考:
  单测     500-2000 个    跑完 < 30s
  集成     50-200 个       跑完 < 5min
  E2E      10-30 个        跑完 < 15min
```

**反模式金字塔**(我见过太多):

```
       ╱╲╲╲╲╲╲╲╲╲╲╲╲╲
      ╱  E2E  占 80%   ╲    ← 测试团队主导,只会写 E2E
     ╱──────────────────╲
    ╱ 单测 占 10%        ╲   ← 开发觉得"反正 E2E 都过了"
   ╱────────────────────╲    
  ╱ 集成 占 10%           ╲
 ────────────────────────
```

**E2E 占 80% 的代价**:

1. **跑得慢**——10 分钟 起步,所有人都在等
2. **flaky 率高**——浏览器 / 网络 / 时序问题
3. **挂了不知道哪一层挂的**——是前端?后端?数据库?Mock 服务?
4. **修一个 E2E 像修案子**——要复现整个用户流程,不是单点 bug

**正确的做法**:把验证下沉到能下沉的最低层。能用单测覆盖的逻辑就别用集成测试,能用集成测试覆盖的就别用 E2E。**E2E 只保留"几个关键用户路径"——下单 / 登录 / 支付,不要"每个按钮点一遍"**。

### 5.2 集成测试的真正姿势

```go
// 反例:集成测试起整个 K8s
func TestOrderService(t *testing.T) {
    // 先 kubectl apply 整个环境...
    // 等 20 个 Pod 就绪...
    // 灌测试数据...
    // 跑测试 30 秒...
    // 清理...
}

// 正确:用 testcontainers 起轻量依赖
func TestOrderService(t *testing.T) {
    ctx := context.Background()
    pg, _ := postgres.RunContainer(ctx,                  // 起一个真 PG
        testcontainers.WithImage("postgres:16-alpine"),
        postgres.WithDatabase("test"),
    )
    defer pg.Terminate(ctx)
    
    dsn, _ := pg.ConnectionString(ctx)
    db, _ := sql.Open("postgres", dsn)
    
    svc := NewOrderService(db)
    order, err := svc.Create(...)        // 真测一遍业务逻辑
    assert.NoError(t, err)
    assert.NotNil(t, order)
}
```

**testcontainers** 是中型团队集成测试的甜蜜区——**起一个真数据库 / Redis / Kafka,跟 mock 比避免"mock 漂移",跟全环境比够轻量**。

---

## 六、Flaky test 的政治学:这是 CFR 的主要来源

**Flaky test** = 同样的代码,有时过有时不过的测试。**这种东西的杀伤力被严重低估**——它不是"小烦人",它是中型团队 Change Failure Rate(CFR)最大的隐性来源。

### 6.1 flaky test 怎么搞死团队

```
工程师 A 的视角:
  下午 4 点 push 一个紧急 hotfix
  CI 跑了 8 分钟,最后一个 E2E 红了
  看一眼:啊,这个 E2E 经常 flaky
  点 "Re-run failed jobs"
  又跑 8 分钟,过了
  merge

  → 总共耽误 16 分钟,但 hotfix 上去了

工程师 B 的视角(同一周):
  改了一个核心模块
  CI 红了,看一眼,跟我改的有关
  但点 "Re-run" —— 居然过了
  以为是 flaky,merge
  
  → 凌晨 2 点 prod 炸

工程师 C 的视角(三周后):
  改了点东西,CI 第一次过
  以为没问题,merge
  
  → 凌晨 3 点 prod 炸,因为 C 改的代码恰好 break 了那个 flaky test 在 90% 的场景

经验:
  一旦团队默认"挂了就 re-run",CI 这层防线就废了。
  flaky test 让"红色"变成"噪音",真正的 bug 也被当成噪音。
```

**Flaky test 是 CFR 的主要隐性来源**——本来 CI 该拦下来的 bug,被 "re-run 大法" 漂上 prod。这是这一篇要强调的核心结论之一。

### 6.2 处理 flaky 的三种策略

```
策略一:自动 retry(危险)
  - retry 一次过了就算过
  - 治标不治本,把 flaky 隐藏起来
  - 适合:新接入的测试 grace period
  - 红线:不能成为长期方案,> 3 次 retry 就是设计错误

策略二:quarantine(隔离)
  - 测试被识别为 flaky → 移到 "flaky 池"
  - flaky 池的测试不阻塞 PR
  - 但有 owner / 有 deadline 修复
  - 适合:发现 flaky 又一时修不了
  - 红线:flaky 池不能变成"测试垃圾场",每周 review

策略三:删除(终极)
  - 修不了 / 没人修 / 已经过时
  - 直接删
  - 适合:测试本身已经没价值
  - 红线:删之前确认它原本要测什么
```

**反对的态度**:"flaky test 跑不了就关掉它"——**关掉本身没错,但要记账**。我见过团队两年内 quarantine 了 200 个测试,没一个修过,最后 quarantine 池变成了"测试墓地",真出 bug 这 200 个测试一个也没拦住。

### 6.3 怎么判定一个测试是不是 flaky

```yaml
# .github/workflows/flaky-detector.yml(示意)
# 每天凌晨把昨天的 CI 跑 5 遍同样的 commit,
# 如果失败率 > 5%,标记为 flaky

name: flaky-detector
on:
  schedule: [{cron: '0 2 * * *'}]
jobs:
  detect:
    strategy:
      matrix:
        run: [1, 2, 3, 4, 5]
    steps:
      - uses: actions/checkout@v4
        with: { ref: ${{ github.event.repository.default_branch }} }
      - run: ./run-tests.sh
        continue-on-error: true
      - run: ./record-result.sh ${{ matrix.run }} ${{ job.status }}
```

**关键指标**:某个测试在最近 100 次运行中,失败率 > 5% 且不是因为代码改动 → flaky。

### 6.4 真正治根:让测试本身不 flaky

flaky 的常见根因:

```
1. 时间相关       — 用 sleep(100) 等异步完成,机器慢就挂
                    修复:用 condition 等待,不要 sleep
2. 顺序相关       — testA 跑完污染了 DB,testB 才能过
                    修复:每个 test 独立 fixture,跑前清场
3. 共享状态       — 多个 test 共享全局变量
                    修复:用 t.Parallel() 不安全的别共享
4. 外部依赖       — 真调第三方 API,网络抖一下挂了
                    修复:mock 外部依赖,只在 contract test 真调
5. 时区 / locale   — 本地 CST,CI runner UTC
                    修复:测试里固定 timezone
6. 端口冲突       — 测试用固定端口,跟另一个测试冲突
                    修复:用 ephemeral port
7. 资源竞争       — CPU 满了,timeout 触发
                    修复:CI runner 别跑满,加 timeout 余量
```

**经验**:**flaky test 几乎都能修,只是没人愿意花一下午修一个测试**。但每个没修的 flaky test 都是未来 CFR 的一颗雷。

---

## 七、GitFlow vs Trunk-based:中型团队的分支策略

### 7.1 GitFlow(老派)

```
master  ────────●────────────────●─────  (生产,tag v1.0 / v1.1)
                │                │
release ──────●─┴──────────────●─┴─────  (准备发版的分支)
              │                │
develop ──●───┴───●───●─●──────┴─●─●───  (开发主干)
          │       │   │ │        │ │
feature   │ ●─────┘   │ │        │ │
          ●─────●─────┘ │        │ │
                        ● hotfix │ │

五种分支:master / develop / feature / release / hotfix
特征:feature → develop → release → master,每个 release 是"批"发布
```

**适合**:季度发版的桌面软件 / 嵌入式 / On-premise。**不适合**:"每天发 N 次"的 SaaS / 微服务,分支管理复杂、merge 冲突频繁、release 跟 develop 严重 diverge。

### 7.2 Trunk-based + Short-lived branch(现代主流)

```
main  ──●──●──●──●──●──●──●──●──●──●──●──●──●─────
        │     │     │        │        │
        │     │     │        │        ●─ feat-d (1 天)
        │     │     │        ●─ feat-c (半天)
        │     │     ●─ feat-b (1 天)
        │     ●─ feat-a (1 天)
        ●─ hotfix (1 小时)

特征:
  - 只有一个长期分支 main
  - feature 分支生命周期 < 2 天
  - 每个 PR 小、快速 merge
  - 未完成的功能用 Feature Flag 隐藏(下一篇 22 讲)
```

**优点**:

- 合并冲突极少
- main 始终可发布
- 工程师 context switch 少
- 配合 Feature Flag,可以 "merge 但不发布"

**缺点**:

- 必须有完整 CI/CD 兜底,不然 main 容易脏
- 需要 Feature Flag 体系支持
- 团队纪律要求高(不能开 long-lived branch)

### 7.3 中型团队怎么选

```
团队 / 业务类型                推荐
─────────────────────────────────────────────────────────
SaaS / 微服务 / 高频发布      Trunk-based + Feature Flag
开源软件 / 库                 类 GitFlow(release 分支)
On-premise 软件 / 季度发布    GitFlow
游戏 / 客户端                 GitFlow + release 分支
中型团队 100 微服务 5000 QPS   Trunk-based(本系列默认)
```

**我的立场**:**中型团队 99% 应该用 trunk-based**。GitFlow 在 SaaS 场景下是技术债——它的 release 分支带来的 merge / cherry-pick 工作量,远超它带来的"批发布"价值。但 Trunk-based 不是免费的,**它依赖 Feature Flag 把"不可见的功能"和"已发布的代码"解耦**——所以第 22 篇要专门讲 Feature Flag 工程。

---

## 八、最小可用的一段 GitHub Actions

下面这段不是"完整模板",**是最小可用的工程级配置**,看清楚每一行为什么写:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

# 同一个 PR 新 push 时,把旧的 CI 自动取消,省 runner 时间
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read
  packages: write
  id-token: write              # OIDC,后面给 cosign 签名用

jobs:
  # ----- PR-time:5 分钟内出结果 -----
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 5         # 必须设 timeout,防 hang
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.22', cache: true }
      - run: go vet ./...
      - run: gofmt -l . | tee /dev/stderr | (! read)  # 有未格式化文件就挂

  unit-test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.22', cache: true }
      - run: go test -race -timeout 5m -coverprofile=cov.out ./...
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: cov.out, retention-days: 7 }

  # ----- merge-time:只在 main push 才跑 -----
  build-and-push:
    needs: [lint, unit-test]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:sha-${{ github.sha }}
            ghcr.io/${{ github.repository }}:main
          cache-from: type=gha          # GitHub Actions 内置 buildx cache
          cache-to:   type=gha,mode=max
```

**关键取舍**:

1. **`concurrency` + `cancel-in-progress`** —— 同 PR 多次 push 时取消旧 CI,**省 runner 时间 + 给反馈更快**
2. **`timeout-minutes`** —— 每个 job 必须设,**防止 hang job 占 runner 数小时**
3. **`permissions` 最小化** —— 不写则默认全开,**安全红线**
4. **PR-time 只跑 lint + unit,merge-time 才 build push** —— 分层
5. **`if: github.ref == 'refs/heads/main'`** —— build 只在 main 跑,**PR 上不推 image**
6. **tag 用 sha,不用 latest** —— `latest` 是后面踩坑章节的红线之一
7. **`-race` flag** —— Go 必带,**找并发 bug**
8. **gofmt 检查用 `| (! read)`** —— 有任何输出就 fail

**没在这份配置里的东西**(在 merge-time 或更后):

- 镜像签名(下一篇 19 讲)
- SBOM 生成(下一篇 19 讲)
- 漏洞扫描(下一篇 19 讲)
- 部署 dev / staging(下下篇 20 讲 GitOps)
- 渐进发布(21 讲)

这一篇 yaml 故意只到"build + push image",**后面三篇会一层层把这条 pipeline 补完**。

---

## 九、CI/CD 的 7 条踩坑

实战里我和同事撞过的坑,按惨烈程度排序:

### 9.1 Secret 进代码 / 进镜像

```dockerfile
# 反例
ENV DATABASE_URL=postgres://user:Pa55w0rd!@db:5432/prod   # 进镜像层
RUN curl -u admin:secret https://internal-api/...         # 进 build log + layer history
```

**修复**:build 阶段用 BuildKit `--mount=type=secret`(不进 layer);运行时用 K8s Secret + envFrom(不进镜像);CI 里用 `${{ secrets.X }}`,**不要 echo / 不要写文件**;git push 前用 gitleaks 扫。

### 9.2 缓存 poisoning

```yaml
# 反例:缓存 key 太粗
- uses: actions/cache@v4
  with: { path: ./build, key: build-cache }   # 所有分支共用 cache → PR 的恶意代码进缓存
```

**机制**:GitHub Actions / GitLab CI 都有"PR 也能写缓存"的设计,**恶意 fork 可以 poison 主分支的 cache**。**修复**:缓存 key 带分支名 / commit hash;`restore-keys` 谨慎用;不缓存 build 产物只缓存依赖(`.m2` / `node_modules`);PR cache 和 main cache 隔离。

> 2024 年 GitHub 出过多起 Action Cache poisoning 相关 CVE。

### 9.3 Runner 单点

**反模式**:整个公司就一个自托管 runner——挂了全公司 CI 停;secrets 全集中一台,一旦被攻破全公司泄露;维护更新要"停服窗口"。**修复**:runner 池化(至少 3 台 N+1 容灾);按环境隔离(dev runner / prod runner secrets 不共享);ephemeral(`ephemeral: true` 每次起新容器);K8s 上用 Actions Runner Controller(ARC)自动扩缩容。

### 9.4 PR-time 跟 merge-time 没分

**反例**:所有 trigger 跑同一个 pipeline,PR 上跑了 15 分钟的 E2E + 镜像构建 + 推 registry,**结果 PR 没 merge 就把镜像推上去**,下游 GitOps 看到新 tag 直接部署 dev。**修复**:**PR-time 不 push 镜像,不部署任何环境**。前面 yaml 的 `if: github.ref == 'refs/heads/main'` 就是这意思。

### 9.5 > 20 分钟没人审

**反模式**:CI 自动 retry 大法——挂了 re-run、再挂 re-run、第三次过 merge,**没人去看为什么挂了**。**修复**:flaky test quarantine 制度;re-run > 2 次必须人审;CI 失败 > 20 分钟没人 ack 升级到团队 Slack。

### 9.6 无快速回滚路径

**反模式**:CD 流水线 30 分钟,回滚也 30 分钟——改 image tag、跑 CI、build、push、deploy……用户骂街。**正确**:回滚 = 改 GitOps 仓库里的 image tag 回上一版本 + ArgoCD sync,**3 分钟**。因为镜像 Build once,旧版本镜像还在 registry,**回滚不需要重新构建**。

**精髓**:**回滚速度是发布速度的下限**——不能比"前向发布"慢。下下篇 20 讲 GitOps 时会把这条落地。

### 9.7 把 CI 当成"运行环境"

**反例**:在 CI 里跑生产数据库连接、跑监控数据查询——CI 跑得越来越慢,某天某个外部依赖挂了,**CI 全挂**。**正确**:CI 是"代码验证"环境,所有依赖可重现(testcontainers / mock);不依赖生产数据库 / 配置中心 / 监控;**跑完不留状态,可重入**。

---

## 十、何时不该用(以及"该用但要降级"的场景)

```
不该上完整 CI/CD:
  - 单人项目 / 周末实验 → 一个 lint + format hook 够了
  - 短期 hackathon / POC → 最简单 GitHub Actions 跑测试就行
  - 客户端 / 嵌入式 / 编译型分发 → CD 需要完全不同的设计

该上但要降级:
  团队 1-3 人,< 10 服务:
    - CI 只跑 lint + unit,手动 kubectl apply
    - 不分 PR-time / merge-time,不上 SBOM / 镜像签名

  团队 3-10 人,10-50 服务:
    - 分层 CI(commit / PR / merge)
    - GitOps 起步,单仓库单环境
    - 镜像签名 + SBOM 起步,不上 OPA 拦截
    - 渐进发布从"灰度 10%"起步

  团队 10-50 人,50-200 服务(本系列默认):
    - 完整 CI/CD 分层 + GitOps 多环境 promote
    - 镜像签名 + SBOM + 漏洞扫描 + 准入控制
    - 渐进发布 + 自动 rollback + Feature Flag
```

**工具不是文化的替代品**。反对的态度:"我们上了 ArgoCD / GitHub Actions,CI/CD 就完事了。"**真相**:CI 跑了 ≠ 测试有效(单测全是 `assert.True(true)` 也能 90% 覆盖率),CD 部署了 ≠ 发布稳(没有渐进发布的 CD 就是"快速把 bug 推上 prod"),GitOps 接了 ≠ 发布安全(Secret 明文进 Git,GitOps 持续同步它到所有集群)。**工具是流程的骨架,流程是文化的载体**。

---

## 十一、CI/CD 心智 checklist

```
CI 设计:
  - 总延迟 < 10 分钟,PR-time < 5 分钟
  - 分层 trigger:commit / PR / merge / release 各有边界
  - 缓存命中率 > 80%,依赖 / build / layer 都缓存
  - 并行而不是串行(lint / test / build 同时跑)
  - 每个 job 设 timeout-minutes,permissions 最小化

CD 设计:
  - Build once, deploy many,镜像 hash 走完所有环境
  - 镜像 tag 用 sha 或 version,不用 latest / 浮动 tag
  - 环境差异在容器外(ConfigMap / Secret / env)
  - 回滚速度 ≤ 发布速度
  - PR 上不推 image,不部署任何环境
  - CD 触发由人审批或 GitOps reconcile,不要"merge 即上 prod"

测试:
  - 金字塔:单测 70% / 集成 20% / E2E 10%
  - 集成测试用 testcontainers,不起整个 K8s
  - E2E 不进 PR,挪到 merge-time 或 nightly
  - flaky test 有 quarantine 制度 + owner + deadline
  - re-run > 2 次必须人审

分支策略:
  - trunk-based + short-lived branch
  - 未完成功能用 Feature Flag,不开 long-lived branch
  - main 始终可发布,PR < 1 天周转

安全:
  - Secret 不进代码 / 镜像 / build log
  - pre-commit + CI 双层 gitleaks 扫描
  - runner 池化 + ephemeral
  - dev / staging / prod runner 隔离
  - PR cache 和 main cache 隔离
```

---

## 十二、踩坑提醒

1. **CI 跑 > 30 分钟**——团队会本能绕过,CI 这层防线废
2. **PR-time 跟 merge-time 没分层**——浪费时间 + PR 上误推镜像
3. **E2E 占测试 80%**——慢 + flaky,把 CI 变成赌博
4. **flaky test 用 retry 大法**——CFR 的最大隐性来源
5. **每个环境重新构建镜像**——dev / staging / prod 跑的不是同一个二进制
6. **image tag 用 `latest`**——下次部署不知道部的是哪个版本,出事查不清
7. **环境差异烤进镜像**(`ENV DB_HOST=...`)——Build once 立刻破功
8. **Secret 进 Dockerfile / CI log**——一次泄露全盘皆输
9. **缓存 key 太宽**——PR poisoning 主分支 cache
10. **runner 单点**——挂了全公司停发布
11. **CI 依赖生产环境**——生产抖 CI 挂,完全反了
12. **CD 自动上 prod 没有渐进发布**——merge 即上 prod 等于赌博
13. **回滚需要重新构建**——MTTR 拉长
14. **`-target` / 局部 CI 在生产**——状态失同步
15. **把 GitOps / 渐进发布 / Feature Flag 都当"未来再说"**——这三个都是 CI/CD 的必要组件,不是 nice-to-have

---

## 十三、小结

回到开篇的那句口诀——**CI 的核心 KPI 不是覆盖率,是延迟**。这一篇所有的工程结论都围绕这条线展开:

1. **CI 和 CD 是两件事**:一个判定"能不能合",一个判定"能不能发",**用制品衔接,不要串成一根线**
2. **流水线分层**:commit / PR / merge / release 四层,各有延迟预算
3. **Build once, deploy many**:一个镜像 hash 走完所有环境,差异在容器外
4. **测试金字塔**:单测 70% / 集成 20% / E2E 10%,E2E 不进 PR
5. **Flaky test 是 CFR 的主要隐性来源**:不能用 re-run 大法,要有 quarantine 制度
6. **Trunk-based + short-lived branch + Feature Flag**:中型团队的默认选择
7. **CI 必须 < 10 分钟**:这是工程纪律,不是品味

**CI/CD 不是工具,是发布纪律**。一支团队对发布的纪律,直接决定 Change Failure Rate / MTTR 这两个数字——而这两个数字,是这个系列贯穿全篇的暗线。

---

下一篇:**`19-制品仓库与镜像供应链.md`**——讲完 CI 这条线,**这一篇产出的"镜像"是个易碎品**。SolarWinds / codecov / xz-utils 这些供应链投毒事件告诉我们,**"我构建的镜像"和"集群里真在跑的镜像"中间还有几公里的路**——Harbor / cosign / SBOM / Kyverno 准入控制,这条链路上的每一环都可能被打穿。**这一篇专讲镜像维度的供应链安全**。
