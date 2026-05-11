# Feature Flag 工程:LaunchDarkly / Unleash / 灰度维度 / 技术债

上一篇讲渐进发布——蓝绿、金丝雀、影子流量。**那一篇解决的是"实例维度"的灰度**:5% 的 pod 跑新代码,95% 的 pod 跑旧代码。但很多真实场景下,**"实例维度"的灰度根本不够**——你想让"北京的某个特定用户"看到新功能,你想让"安卓 v4.2.1 以上的设备"启用新逻辑,你想"凌晨 3 点突发流量异常时秒级关掉一个吞吐量高的非核心功能"——这些都不是 K8s 灰度能办到的。

这一篇就讲另一个维度的灰度:**Feature Flag**。**它不是"工具",是一整套"把发布(deploy)和启用(release)解耦"的工程方法**。代码可以提前一周 deploy 到生产,**但功能由 flag 控制——开 / 关 / 给 1% 用户 / 给某个 B2B 大客户**——这件事的价值远超"灰度"本身,它是现代发布工程的硬骨架。

> 一句话先记住:**Feature Flag 的核心价值不是"灰度",是"把发布的不可逆性解开"**——传统发布里,"上线"和"启用"是耦合的一件事,翻车只能 rollback 代码;有了 Flag,代码先上,功能后开,出问题"关 flag"秒级生效,**不需要触发任何 deploy 流程**。但工具只是开始——Flag 真正的工程难点是「**长出来容易,删干净难**」,半年不管就一堆僵尸 flag,这一篇下半段会讲清楚 Flag 治理的纪律,不讲清楚的话你团队 1 年内就会撞上"代码里 200 个 flag,谁都不敢删"的死锁。

---

## 一、问题场景:没有 Feature Flag 的团队在踩什么坑

### 1.1 死法一:大功能想上线,但只想给 10 个用户试用

```
PM:这个"新版搜索"想先给我们的 KA 客户用 2 周,收集反馈再放开
Dev:OK,我做一个"白名单",把这 10 个用户 ID 写死在 if 里

if user.id in [1001, 1002, ..., 1010]:
    return new_search(...)
else:
    return old_search(...)

2 周后:
PM:加 5 个用户试试
Dev:改代码,重新发布

3 周后:
PM:用户A 反馈不好,把他从白名单移除
Dev:再改代码,再发布

某次 Dev 忘了把测试用户从白名单移除 → 生产代码里硬编码了"内部员工 999"
某次合并冲突 → 白名单被覆盖,所有 KA 用户失去权限,客服爆炸
```

**根因**:把"灰度名单"当成"代码"管。每次改名单都要发布,**配置和代码耦合,没有运营自助路径**。

### 1.2 死法二:某功能想紧急关闭,但只能 rollback

```
20:00  发布 v3.2,新增了"实时推荐"功能
22:00  发现"实时推荐"调用的下游 ML 服务扛不住,P99 飙到 8s,整站慢
22:01  团队决定关闭这个功能
22:02  "实时推荐"没有 flag,只能 rollback 代码
22:03  rollback 触发,30 个 pod 滚动重启 6 分钟
22:09  好不容易回滚完
22:15  发现其他几个 v3.2 才修的 bug 又回来了
22:30  最终走 hotfix,把"实时推荐"那行代码注释掉,重新发布
```

**根因**:**功能没有"关闭"按钮,只能整个版本回退**。一个新功能拉跨,把其他无关 fix 一起拖下水。**这种事故每年都在发生,且完全可避免**。

### 1.3 死法三:A/B 实验靠改代码

```
PM:我想做个 A/B 实验,看看"购物车结算页"红色按钮还是绿色按钮转化率高
Dev:OK,我加个 if random() < 0.5

if random() < 0.5:
    button_color = "red"
else:
    button_color = "green"

PM:实验结果怎么看?
Dev:加埋点,统计哪种颜色的转化高
PM:能不能给 A 组红色 7 天,然后切到全部红色?
Dev:得改代码,再发布

PM:能不能新加一个版本测黄色?
Dev:再改代码,再发布
```

**根因**:**A/B 实验和"灰度发布"的需求几乎一致,但被分成两件事做**——A/B 走代码改+埋点,灰度走 K8s yaml,两者完全不复用。Dev 烦死,PM 等得久,实验效率低到没法快速迭代。

### 1.4 三种死法的共同点

```
死法一:灰度白名单写代码      → 灰度名单 = 配置,不该是代码
死法二:功能没有"关闭按钮"     → 启用和发布耦合,不该耦合
死法三:A/B 实验靠改代码      → 实验配置 = 配置,不该是代码
```

**这三个问题的根本解决方案,都是 Feature Flag**——把"什么用户在什么时候看到什么功能"从代码里抽出来,变成可运营、可观测、可秒级生效的配置。

---

## 二、Feature Flag 是什么:发布与启用的解耦

### 2.1 一句话定义

Feature Flag(也叫 Feature Toggle / Feature Switch)= **一段代码里用 `if flag.is_enabled(name, user) { ... } else { ... }` 包起来的分支判断,其中 `is_enabled` 的真值由外部配置决定,可以在不重新发布代码的前提下被切换**。

### 2.2 工作流

```
┌──────────────────────────────────────────────────────────────┐
│                  Feature Flag 完整工作流                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐                                            │
│   │  Flag Admin │ ← PM / 运营 / 工程师 在 Web UI 改 flag      │
│   │   Web UI    │                                            │
│   └──────┬──────┘                                            │
│          │ HTTP POST 改配置                                   │
│          ▼                                                   │
│   ┌──────────────┐                                           │
│   │ Flag Service │ ← LaunchDarkly / Unleash / 自建            │
│   │  (Server)    │ ← 存所有 flag 定义、规则、灰度比例          │
│   └──────┬───────┘                                           │
│          │ SSE / WebSocket / Polling                         │
│          │ 向所有 SDK 推送变更                                │
│          ▼                                                   │
│   ┌──────────────────────────────────┐                       │
│   │   应用进程内的 Flag SDK           │                       │
│   │   - 本地缓存 flag 规则             │                       │
│   │   - 评估用户 → flag 真值           │                       │
│   │   - 上报评估结果(可选)            │                       │
│   └────────────────┬─────────────────┘                       │
│                    │                                         │
│                    ▼                                         │
│   ┌──────────────────────────────────┐                       │
│   │   应用代码                        │                       │
│   │                                  │                       │
│   │   if flag.is_enabled(            │                       │
│   │       "new_checkout",            │                       │
│   │       user=current_user) {       │                       │
│   │     return new_checkout()        │                       │
│   │   } else {                       │                       │
│   │     return old_checkout()        │                       │
│   │   }                              │                       │
│   └──────────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

**核心特点**:

1. **配置在外部**——flag 真值不在代码里,在 Flag Service 里
2. **变更秒级生效**——SDK 通过 SSE / WebSocket / 短轮询拉到新规则,不需要重启进程
3. **可基于用户上下文判断**——同一个 flag,user_123 看到 true,user_456 看到 false
4. **本地评估**——SDK 在本地决定真值,**不是每次都调 Flag Service**(否则单点会拖死整站)
5. **fallback**——Flag Service 挂了,SDK 用本地缓存的最后已知规则,或用"默认值"兜底

### 2.3 核心价值四件

```
价值                      解决的问题
─────────────────         ──────────────────────────────────
1. Deploy / Release 解耦  代码 deploy 不等于功能 release,可以提前 deploy
                          降低发布风险,功能可以慢慢"打开"
                          
2. 灰度                   按用户 ID / 地域 / 版本灰度,粒度比 K8s 流量切分细
                          可以"给某个特定 KA 用户 / 内部员工"提前用
                          
3. 应急熔断(Kill Switch) 出事不用 rollback 代码,关 flag 秒级生效
                          这是 Flag 真正"救命"的场景
                          
4. A/B 测试               把灰度的"50% 看 A,50% 看 B"变成可重复的实验配置
                          配合埋点上报,产品决策有数据支撑
```

**这四个价值里,我认为"应急熔断"是最被低估的**——平时不显眼,出事时它是命门。**一个 100 个微服务的系统,关键的非核心功能(推荐 / 个性化 / 实时分析)都该有 Kill Switch**,出事时一秒关掉,主流程救活。

---

## 三、选型:LaunchDarkly / Unleash / Flagsmith / OpenFeature / 自建

Feature Flag 工具市场五个主流方案,**完全不是"哪个最好"的问题,是"你团队规模和预算决定哪个适合"**。

### 3.1 五个方案对比

| 方案 | 类型 | 优势 | 劣势 | 价格(2026 美元) |
| --- | --- | --- | --- | --- |
| **LaunchDarkly** | SaaS | 行业标杆,SDK 最全,生态最深 | 贵,需要可访问外网 | ~$15/seat/月 + MAU 费,中型团队 $1k-5k/月 |
| **Unleash** | 开源 + 商业 | 开源功能完整,自托管可控,中型团队首选 | UI 比 LD 弱,实验功能在 enterprise | OSS 免费;Cloud $80/月起 |
| **Flagsmith** | 开源 + 商业 | 开源完整,UI 友好,边缘评估好 | 生态比 Unleash 略小 | OSS 免费;Cloud $45/月起 |
| **OpenFeature** | 标准 / SDK 抽象 | CNCF 项目,SDK 抽象层,避免供应商锁定 | 不是产品,需要后端(LD / Unleash / Flagsmith) | 免费 |
| **自建** | DIY | 完全可控,0 license 费 | 工程成本极高,要维护 SDK / 评估引擎 / UI / 高可用 | 一个 SRE 半年工时 |

### 3.2 五个方案的取舍

```
团队 < 5 人 / 几个 flag         → LaunchDarkly 太贵,Unleash 太重,
                                  用 Redis + Web 自建够用(< 100 行)

团队 5-30 人 / 中型业务系统      → Unleash 自托管,功能完整,
                                  和 K8s + Prometheus 生态贴合

团队 30+ / 多产品线             → LaunchDarkly,SDK / 实验 / 审计完整,
                                  对外多客户用 segment 管,价值高

跨多个 SaaS 客户 / 不想锁定供应商 → OpenFeature SDK + 任意后端,
                                  以后换供应商不改代码

监管严格 / 不能用 SaaS          → Unleash / Flagsmith 自托管
                                  + 自建审计日志

国内业务 / 完全国产化            → 自建 + 飞书 / 钉钉机器人审批
                                  + Apollo / Nacos 当配置中心一并复用
```

### 3.3 我对中型团队的建议

```
中型团队(10 人 / 100 微服务 / 5000 QPS)起步路径:

Step 1  写 SDK 之前先用 OpenFeature 接口
        → 团队代码里所有 if flag.is_enabled() 调 OpenFeature API
        → 后端先用 NoOp Provider,真值都是 default,等于没接

Step 2  装 Unleash 自托管
        → 一个 K8s deployment + 一个 PostgreSQL,跑起来 30 分钟
        → 把 OpenFeature 的 Provider 切到 Unleash

Step 3  从一个 P2 业务接入
        → 选一个变化频繁的功能(比如"首页 banner 轮播策略")
        → 接入 flag,跑 2 周,看运营自助效果

Step 4  扩展到关键服务的"Kill Switch"
        → 给所有非核心功能(推荐 / 个性化 / 实时分析)加 kill switch
        → 半夜出事时一键关闭

Step 5  接 A/B 实验(可选)
        → 如果产品需要,加埋点和实验分组
```

**为什么要用 OpenFeature 抽象层**:**早期投入的代码不会被锁死**。如果 Unleash 后期不够用,可以换 LaunchDarkly,**业务代码一行不改**——这件事一年后会让你感谢自己。

---

## 四、灰度维度:Flag 评估的输入

Feature Flag 真正强大的地方不是"开 / 关",是**基于用户上下文做精细化决策**——同一个 flag,不同用户看到不同结果。这个"上下文"通常包含:

### 4.1 七种主流维度

```
┌────────────────────────────────────────────────────────────┐
│  灰度维度对比                                                │
├──────────────┬─────────────────┬───────────────────────────┤
│  维度         │  典型用例        │  陷阱                     │
├──────────────┼─────────────────┼───────────────────────────┤
│  用户 ID hash │ "随机 5% 用户"   │ key 必须稳定,不能用       │
│              │  最常见         │  随机数 / IP / cookie     │
├──────────────┼─────────────────┼───────────────────────────┤
│  地域         │ "先在上海试 1 周" │ IP→地域 准确度不高,       │
│              │                 │  典型 95% 准                │
├──────────────┼─────────────────┼───────────────────────────┤
│  设备         │ "iOS 用户先用"   │ User-Agent 可伪造,        │
│              │                 │  内部需要的话用客户端 SDK   │
├──────────────┼─────────────────┼───────────────────────────┤
│  客户端版本   │ "v4.2.1+ 启用"   │ 旧客户端 fallback 路径必备 │
├──────────────┼─────────────────┼───────────────────────────┤
│  租户(B2B)│ "公司 A 启用"     │ 租户 ID 必须早就埋进上下文 │
├──────────────┼─────────────────┼───────────────────────────┤
│  百分比       │ "10% 流量"       │ 同 ID hash,key 选择关键 │
├──────────────┼─────────────────┼───────────────────────────┤
│  特定属性     │ "VIP / 年龄 30+" │ 属性必须服务端可见         │
│              │                 │ 不能由客户端 self-declare  │
└──────────────┴─────────────────┴───────────────────────────┘
```

### 4.2 用户 ID hash:稳定灰度的标准做法

```
错的做法(随机):
   if random.random() < 0.05:   # 5% 用户
       return new_feature()
   else:
       return old_feature()

  问题:同一个用户第二次访问可能看到不同结果,
        "切换"的体验极差,bug 更难复现

对的做法(用户 ID hash):
   bucket = hash(user.id + "feature_xyz_salt") % 100   # 0-99
   if bucket < 5:                                       # 5% 桶
       return new_feature()
   else:
       return old_feature()

  保证:同一个 user.id 在 flag 配置不变时永远看到同样结果
        放量 5% → 10% 时,新增的 5% 是上一批没看到的,不是新一批随机
```

**为什么要加 salt**:不同 flag 应该有不同的 bucket 分布。如果所有 flag 都用 `hash(user.id) % 100`,**同一批"前 5%"用户会在所有 flag 都被选中**——他们成了"永远的灰度白鼠",体验最不稳。**每个 flag 配自己的 salt,bucket 分布在不同 flag 之间独立**。

### 4.3 多维度组合规则

工业 Flag 工具支持「规则链」:**按顺序匹配,匹配中就返回,匹配不上往下走**:

```
flag: new_checkout
─────────────────────────────────────────
Rule 1: user.tier == "internal"      → ENABLED (内部员工先用)
Rule 2: user.country == "JP"          → DISABLED (日本暂不上)
Rule 3: client.version >= "4.2.1"     → 
          - 5% bucket → ENABLED       (移动新版灰度)
          - 否则      → DISABLED
Default                               → DISABLED
```

**这种规则的核心价值**:**运营 / 产品在 Web UI 上调,工程师不写代码**。Dev 只负责保证 `current_user.tier` / `current_user.country` 这些字段被正确地传入 SDK。

---

## 五、Flag 类型:不要把所有 flag 当一种东西

Martin Fowler 在《Feature Toggles》一文里提出 Flag 类型化的思路——**不同寿命、不同目的的 flag,管理纪律完全不一样**。混在一起的代价是治理混乱。

### 5.1 四种 Flag 类型

```
┌─────────────────────────────────────────────────────────┐
│  Flag 类型             生命周期       动态变更        │
├─────────────────────────────────────────────────────────┤
│  1. Release Flag       1-30 天        是             │
│     "新功能灰度发布"                                    │
│     发布后逐步放量,放量 100% 后立刻删                  │
│                                                       │
│  2. Experiment Flag    2-12 周        是             │
│     "A/B 实验 / 多臂老虎机"                            │
│     实验结束后 → 选胜出方案,删 flag                   │
│                                                       │
│  3. Ops Flag           长期 / 永久    是             │
│     "应急熔断 / 容量限制 / 降级开关"                   │
│     不删,但要定期演练                                  │
│                                                       │
│  4. Permission Flag    长期 / 永久    是             │
│     "Premium 用户才能用 / B2B 客户白名单"              │
│     这本质是权限系统,不应该用 flag 长期管             │
│     → 早期可以用,业务稳定后迁到正经权限系统           │
└─────────────────────────────────────────────────────────┘
```

### 5.2 四种类型的管理纪律差异

```
Release Flag:
   - 必须有 owner + 创建日期 + 到期日
   - 到期日(典型 30 天)前没放完 → 强制提醒 / 升级
   - 放完 100% → 1 周内必须删
   - 团队季度 review 所有 Release flag,删僵尸

Experiment Flag:
   - 必须有"实验设计"(指标、显著性、停止规则)
   - 实验期到了 → 必须出报告 + 决策(选哪个方案)
   - 决策完 → 1 周内删 flag,代码合并胜出方案

Ops Flag:
   - 不死,但每月强制"试关"演练 1 次
   - 演练流程:在 staging 关 → 验证降级行为 → 关闭并恢复
   - 不演练 = 它根本不能用(代码可能已腐烂)

Permission Flag:
   - 短期 OK,但 6 个月后要评估"是不是该升级到正式权限"
   - 用 flag 管 1000 个客户的权限矩阵 = 噩梦
   - 早做迁移
```

**最常见的失败模式**:**所有 flag 都被当成 Release flag**,没有区分——结果 Ops flag 也被半年清理一次,演练从来不做,真出事的时候才发现"这个降级开关代码已经不工作了"。

---

## 六、技术债:Flag 治理是这一篇的真核心

讲了一圈"Flag 多好用",**这一节讲它的反面——Flag 是技术债的高产户**。

### 6.1 僵尸 Flag 是怎么长出来的

```
T+0   Dev 加了一个 flag "new_checkout"
T+10  灰度 5% → 25% → 50% → 100%
T+11  Dev 想:"先放一周观察,稳定了我再删"
T+18  忘了
T+30  另一个 Dev 看到这个 flag,问 "这还要不要?"
       原 Dev 说:"还在观察,先留着"
T+60  原 Dev 离职 / 转组
T+90  团队 review,发现这个 flag,问 "owner 是谁"
       没人知道,大家都不敢删
T+180 代码里这个 if 分支已经长出了 5 个 sub-flag
       删 flag 等于删一片代码,但谁都不敢动
T+365 团队的"Flag 列表"已经 200 个,80% 是僵尸
       新人 onboard 一脸懵:这些 if 都是干嘛的
```

**根因**:**Flag 是"加"很容易,"删"是工程动作**。删 flag 不是改 UI 里的开关默认值,**是要去代码里删掉整个 if 分支,然后做一次 PR + CI + deploy**。这个工作量没人主动做,僵尸自然生长。

### 6.2 治理三件套:owner / 到期日 / 季度清理

```
┌──────────────────────────────────────────────────────────┐
│  Flag 治理三件套                                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. 每个 Flag 必须有 Owner                                 │
│     - 创建 flag 时强制填,不填 SDK 拒绝注册               │
│     - Owner 离职 / 转组 → 强制 reassign                  │
│     - Owner 的工作:flag 的生死他负责                     │
│                                                          │
│  2. 每个 Flag 必须有"预计删除日期"                         │
│     - Release flag:默认 30 天                            │
│     - Experiment flag:默认 60 天                         │
│     - Ops / Permission:可选"长期"                        │
│     - 到期未删 → 自动飞书 / 邮件给 owner,5 次未处理升级到经理│
│                                                          │
│  3. 季度清理                                              │
│     - 每季度扫一次:                                       │
│       a. 100% 启用 且 > 60 天 → 删!                      │
│       b. 0% 启用 且 > 60 天 → 删!                        │
│       c. owner 已离职 / 无明确目的 → 评估删!              │
│     - 团队 OKR / 绩效里加"Flag 清理"指标                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 6.3 删 Flag 是真删代码

**重点重申**:删 flag 不是"在 UI 里把 flag 状态调到 100% 启用就完事"——**是真删代码**。

```
错的"删 flag":
   - UI 上把 new_checkout 调到 100% 启用
   - 代码里 if flag.is_enabled("new_checkout") { new() } else { old() }
   - 永远走 new() 分支,old() 分支变成死代码
   - flag 本身还在,SDK 还在查询,新人还以为它有意义

对的删 flag(完整三步):
   Step 1   在 UI 上把 flag 强制设为 100%(不管之前的灰度规则)
   Step 2   等一周,确认没人投诉
   Step 3   提 PR:
              - 代码里删掉 if flag.is_enabled("...") 的判断
              - 直接调用 new()
              - 删掉 old() 函数 / 路径
              - 删掉 flag 的定义
              - CI / staging / prod 验证一遍
   Step 4   PR 合并 deploy 后,在 UI 上 archive flag(不是 disable!)
```

**只有"代码里删干净 + UI 里 archive"双双完成,这个 flag 才算真死**。少做一步,僵尸还会复活。

### 6.4 防止 Flag 蔓延的代码纪律

```
✓ 鼓励的做法:
   - 一个功能一个 flag(粒度大,长得慢)
   - flag 只在"入口处"判断,内部逻辑不再分支
   - 一旦放量到 100%,1 周内必删

✗ 禁止的做法:
   - 在循环里 / 高频路径里查 flag(SDK 缓存能扛但代码可读性烂)
   - "为了未来灵活"加 flag(YAGNI 原则,真要的时候再加)
   - flag 套 flag(if flag_A && flag_B || flag_C → 复杂度爆炸)
   - 用 flag 替代正经的权限系统 / 多租户隔离
   - 同一个 flag 在不同环境(dev / staging / prod)行为不一致
     (这是"配置漂移",见 27 篇)
```

---

## 七、最小接入:OpenFeature + Unleash

讲了一堆原则,下面给真代码。**这一节是给"明天就要在团队里跑起来"的工程师**。

### 7.1 OpenFeature SDK 接入(Go)

```go
package main

import (
    "context"
    of "github.com/open-feature/go-sdk/openfeature"
    unleash "github.com/Unleash/unleash-openfeature-provider-go"
)

func main() {
    // 一次性初始化,在进程启动时调用
    provider, _ := unleash.NewProvider(unleash.ProviderConfig{
        UnleashURL:  "https://unleash.example.com/api",
        ApiToken:    "<token>",
        AppName:     "order-api",
    })
    of.SetProviderAndWait(provider)
}

func handleRequest(ctx context.Context, user User) {
    // 业务代码每次请求都这么写
    client := of.NewClient("order-api")
    evalCtx := of.NewEvaluationContext(
        user.ID,
        map[string]interface{}{
            "country":        user.Country,
            "tier":           user.Tier,
            "client_version": user.ClientVersion,
        },
    )
    
    if client.Boolean(ctx, "new_checkout", false, evalCtx) {  // 第二个参数 = default
        newCheckout(user)
    } else {
        oldCheckout(user)
    }
}
```

**关键点**:

1. **`of.NewClient("order-api")` 创建一次复用**——不要每次请求都 new(SDK 内部有缓存,但还是降低开销)
2. **第二个参数是 default**——Flag Service 挂了 / flag 不存在,返回这个值
3. **`evalCtx` 必须传完整用户上下文**——country / tier / client_version 这种灰度维度依赖
4. **`SetProviderAndWait` 启动时等 provider 就绪**——避免冷启动期 default 全返回

### 7.2 OpenFeature SDK 接入(TypeScript)

```typescript
import { OpenFeature } from '@openfeature/server-sdk';
import { UnleashProvider } from '@openfeature/unleash-provider';

// 进程启动
const provider = new UnleashProvider({
  url: 'https://unleash.example.com/api',
  appName: 'order-api',
  customHeaders: { Authorization: '<token>' },
});
await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient('order-api');

// 业务代码
async function handleRequest(user: User) {
  const evalCtx = {
    targetingKey: user.id,                    // OpenFeature 规范的用户 key
    country: user.country,
    tier: user.tier,
    client_version: user.clientVersion,
  };

  const enabled = await client.getBooleanValue(
    'new_checkout',
    false,          // default
    evalCtx,
  );
  return enabled ? newCheckout(user) : oldCheckout(user);
}
```

### 7.3 Unleash 服务端 deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: unleash
  namespace: feature-flag
spec:
  replicas: 2
  selector:
    matchLabels:
      app: unleash
  template:
    metadata:
      labels:
        app: unleash
    spec:
      containers:
        - name: unleash
          image: unleashorg/unleash-server:5.12.0
          ports:
            - containerPort: 4242
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: unleash-pg
                  key: url
            - name: INIT_ADMIN_API_TOKENS
              valueFrom:
                secretKeyRef:
                  name: unleash-tokens
                  key: admin
          resources:
            requests:
              cpu: 200m
              memory: 256Mi
            limits:
              cpu: 1
              memory: 1Gi
          livenessProbe:
            httpGet: { path: /health, port: 4242 }
            periodSeconds: 30
          readinessProbe:
            httpGet: { path: /health, port: 4242 }
            periodSeconds: 10
```

**关键取舍**:

1. **副本数 2 起步**——单点 Unleash 挂了,SDK 用本地缓存兜底,但变更要 1 分钟以上才生效
2. **PostgreSQL 用 cloud-managed**(RDS / CloudSQL)——别自己 K8s 起 PG,Flag Service 对 DB 强依赖
3. **资源 1 vCPU / 1Gi**——中型团队 50 个 flag、1000 QPS 评估,这个配置够用
4. **`INIT_ADMIN_API_TOKENS` 从 Secret 注入**——绝不写死,token 泄露 = 别人能改你所有 flag

### 7.4 真实的 flag 评估代码:错误处理是重点

```python
from openfeature import api as of

def get_checkout_handler(user: User):
    """
    返回 new 或 old checkout handler
    Flag: new_checkout
    Default: False (走 old)
    Owner: payment-team
    To-Delete-By: 2026-08-15
    """
    client = of.get_client("order-api")
    
    try:
        eval_ctx = {
            "targetingKey": user.id,        # 用户唯一标识,稳定的
            "country":      user.country,   # 地域灰度
            "tier":         user.tier,      # 用户分层(VIP / 普通)
            "client_version": user.client_version,
        }
        # 第二个参数 default 必须是"出问题也安全"的值
        enabled = client.get_boolean_value(
            "new_checkout",
            False,          # 默认值 = 走老路径(已经验证过的)
            eval_ctx,
        )
    except Exception as e:
        # SDK 异常 / 超时 → 走 default,不要让 flag 评估失败导致请求失败
        logger.warning("flag eval failed, falling back to default", error=e)
        enabled = False
    
    return new_checkout if enabled else old_checkout
```

**关键纪律**:

1. **default 必须是"安全值"**——一般是 false(走旧路径)。**不要把 default 设成 true 然后用 flag 关闭"新功能"**,Flag Service 一挂全员看到新功能。
2. **try/except 兜底**——SDK 调用必须永远不能抛异常导致主流程失败。**Flag 评估永远是辅助,不能成为依赖**。
3. **代码注释里写 flag 元数据**——owner / 到期日 / 描述,在 PR review 时同行看得见。
4. **`targetingKey` 必须稳定**——同一个用户每次评估传同样的 key,**绝不能用 IP / 临时 cookie / session ID**(这些会变,导致灰度抖动)。

---

## 八、Flag 与渐进发布:正交的两个维度

新人最常问的问题:「**有了金丝雀,还要 Feature Flag 吗?**」

**答案**:**要,而且它们是正交的两个维度**——金丝雀控制"实例维度",Flag 控制"启用维度",同一次发布两件事可以叠加。

### 8.1 两者的对比

```
                金丝雀                Feature Flag
                ──────────────────    ──────────────────
控制目标         pod 实例的流量比例     某段代码的启用与否
粒度             5% / 25% / 50% pod    具体到用户 ID / 属性
生效时间         需要 K8s rollout 改   秒级(SDK 拉新规则)
回退方式         调 weight 回 0       关 flag
适合场景         整个服务版本切换       单个功能开关 / 实验
保留时间         发布完即结束          可长期保留(如 Kill Switch)
配置位置         K8s yaml / GitOps     Flag Service Web UI
```

### 8.2 怎么组合用

```
┌────────────────────────────────────────────────────────────┐
│  典型组合场景                                                │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  场景:发布 v2.4.7,包含 3 个新功能,其中 2 个想灰度        │
│                                                            │
│  Step 1:代码里 3 个新功能都用 flag 包                       │
│           - feature_A: flag "new_checkout"                 │
│           - feature_B: flag "new_search"                   │
│           - feature_C: 没 flag(小修复)                     │
│                                                            │
│  Step 2:flag 全设为 OFF,代码 deploy 到生产                 │
│           - 用渐进发布(金丝雀)推 v2.4.7                    │
│           - 1% → 5% → 25% → 50% → 100%                    │
│           - 每挡观察:错误率 / P99 / 资源占用                │
│           - 这个阶段验证的是"代码本身能跑"                   │
│                                                            │
│  Step 3:v2.4.7 全量后,flag 仍 OFF,行为等同 v2.4.6         │
│           - 验证完成,no surprise                          │
│                                                            │
│  Step 4:开始 flag 灰度                                     │
│           - Day 1:new_checkout 给 5% 用户开                │
│           - Day 3:扩到 25%                                 │
│           - Day 7:100%                                    │
│           - new_search 同理                                │
│                                                            │
│  Step 5:flag 100% 一周后,删除 flag(改代码)               │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**这种组合的关键价值**:**代码发布 和 功能发布 是两件独立的事**——v2.4.7 deploy 完成 = 代码工程结束;flag 100% + 删 = 产品功能结束。两件事的节奏完全独立,**互不阻塞**。

### 8.3 工程上怎么权衡

```
小修复 / Bug fix       → 不用 flag,渐进发布即可
                        flag 反而增加复杂度
                        
中等功能(用户感知)     → flag 包起来,渐进发布 + flag 灰度
                        典型:"新版搜索"、"新结算流程"

大功能(架构级 / 风险高) → flag + 渐进发布 + 影子流量
                        三层保护,稳如老狗
                        典型:"切换支付下游"、"重写订单核心"

紧急 hotfix            → 走快速通道,不必新建 flag
                        如果是关闭某个功能,关已有的 flag(假设之前埋过)
```

---

## 九、何时该用 Feature Flag / 何时不该

**Flag 是有维护成本的,滥用会把代码搞乱**。这一节给具体决策矩阵。

### 9.1 该用 Flag 的四类场景

```
✓ 用户感知的功能改动
   - 新的 UI / 交互流程 / 业务规则
   - 想要"灰度放量"或"按客户白名单开放"
   - 上线后想"先开 1 周看反馈"

✓ 可调节的运行时配置
   - 速率限制阈值(峰值时手动调)
   - 重试次数 / 超时时间
   - 是否启用某个下游(降级用)

✓ A/B 实验
   - 多个候选方案的转化率对比
   - 多臂老虎机优化

✓ 运营紧急关闭(Kill Switch)
   - 推荐 / 个性化等"非核心但耗资源"功能
   - 出事时一键关闭主流程救活
```

### 9.2 不该用 Flag 的四类场景

```
✗ 纯重构(不改变行为)
   - 重构是"对外行为不变"的代码改动
   - 包 flag 等于"两个版本并存",违背重构的纪律
   - 用渐进发布 + 影子流量验证就够了

✗ 纯性能优化
   - 优化算法 / 加缓存 / 改数据结构
   - 这种改动的"对外行为不变",同上
   - 性能优化的灰度走金丝雀,不走 flag

✗ 生命周期 < 1 周的小功能
   - 加 flag → 灰度 → 删 flag 的工作量,可能超过功能本身
   - 直接发布 + 渐进灰度即可
   - 例外:风险高的小功能(支付 / 鉴权)还是值得 flag

✗ 长期权限管理
   - "Premium 用户能用 / 免费用户不能用"
   - 短期可以 Permission Flag,但稳定后必须迁正经权限系统
   - 用 flag 管 1000 个客户的权限 = 维护噩梦
```

### 9.3 一个常被混淆的决策

「这个新功能要不要包 flag?」

```
判断三问:
  1. 这个功能上线后,是否可能因为 bug 或性能问题需要紧急关?
     是 → flag
     否 → 继续问
  
  2. 是否需要给"特定用户群"(白名单 / VIP / 内部)先用?
     是 → flag
     否 → 继续问
  
  3. 是否要做 A/B 实验?
     是 → flag
     否 → 继续问
  
  三问都"否" → 不用 flag,直接发布
  
  典型例子:
  - "改个按钮文案"            → 都"否",不用 flag
  - "新支付流程"              → 第一问"是",必须 flag
  - "首页 banner 个性化推荐"   → 第一问"是",必须 flag
  - "重构数据库查询逻辑"       → 都"否"(行为不变),不用 flag
```

---

## 十、7 条踩坑

### 10.1 Flag 数失控

**症状**:1 年后代码里 200+ flag,80% 是僵尸,新人 onboard 看 if 看到崩溃。

**根因**:没有治理纪律——加 flag 没 owner / 到期日,删 flag 没流程,新增容易删除难。

**避坑**:

```
1. 入口管制:加 flag 必须 PR 里写 owner + 到期日 + 描述
2. 出口主动:每季度强制清理,把"已 100% 且 > 60 天"全部 delete
3. 指标治理:Flag 总数列入团队健康度,> 50 个就要警惕
4. 自动化扫描:写脚本扫代码里的 flag 名 + Flag Service 里的 flag,
              对不上号的就是僵尸
```

### 10.2 测试环境忘开 / 漏测

**症状**:staging 跑得好好的,生产开 flag 后 5xx 飙起来。

**根因**:**dev / staging / prod 的 flag 状态不一致**——staging 上 flag 已经默认 ON 跑了一周,但生产 OFF,实际测试的是"flag ON 的代码路径",生产开的是"刚切到 ON 的代码路径"。

**避坑**:

```
1. dev / staging / prod 应该有一致的 default(默认 OFF)
2. 灰度测试在 prod 里做,staging 只做"代码能跑"的验证
3. 重要 flag 切换前,先在 staging 跑过完整切换流程
4. CI 里加"flag 状态 diff 检查":如果 staging 和 prod 不一致,告警
```

### 10.3 默认值错误导致全量灾难

**症状**:Flag Service 短暂故障,SDK 返回 default,全员 5xx。

**根因**:**default 写成了 true(新功能)**。SDK 拿不到 Flag Service 的真值,fallback 到 default(true),**等于全员秒切到未验证的新功能**。

**避坑**:**default 永远是"已知安全的旧路径"**:

```python
# ✗ 错的:default = True
enabled = client.get_boolean_value("new_checkout", True, ctx)

# ✓ 对的:default = False
enabled = client.get_boolean_value("new_checkout", False, ctx)
```

**这条铁律不要破例**——任何"反着写"的 flag 都是定时炸弹。

### 10.4 SDK 缓存导致灰度不生效

**症状**:Flag Service UI 上已经把灰度从 5% 改到 50%,但生产监控发现只有 ~5% 流量走新路径。

**根因**:**SDK 缓存了 5 分钟没刷新**——大部分 SDK 是 polling 模式,默认 30 秒 - 1 分钟拉一次,但有些自建实现是"启动时拉一次,之后不刷新"。

**避坑**:

```
1. 优先用支持 SSE / WebSocket 推送的 SDK(Unleash / LD 都支持)
2. polling 模式的 SDK,刷新间隔不要超过 1 分钟
3. 紧急切换的 flag(Kill Switch)→ 用支持推送的 SDK,不依赖 polling
4. 生产灰度后等待 5 分钟,再看监控,**不要发现"没切"就慌**
5. 监控 SDK 自身的"上次刷新时间",超过 N 分钟告警
```

### 10.5 用户 hash 不稳定 / 用错 key

**症状**:同一个用户来回切换看到新旧版本,体验破碎,投诉爆炸。

**根因**:**用了不稳定的 key 做 hash**——IP / cookie / session ID / 设备指纹都会变。

**避坑**:**`targetingKey` 必须是稳定的业务 ID**:

```
✓ 正确的 key:
   - 已登录:user.id(数据库主键,永不变)
   - 未登录:device_id(SDK 生成的 UUID,本地存储,长期不变)

✗ 错误的 key:
   - request.ip(用户网络环境变就变)
   - session_id(session 过期就变)
   - cookie 值(被清理就丢)
   - 随机数(每次请求都不一样)
```

**对于"未登录用户的灰度"**:**客户端 SDK 必须生成长期稳定的 device_id 并写到本地存储**——这是产品和工程一起的硬要求。

### 10.6 命名混乱

**症状**:Flag 列表里有 `new_feature` / `new_feature_v2` / `new_feature_final` / `new_feature_FINAL_FINAL`,谁也搞不清谁是活的。

**根因**:**没有命名规范**。每个 Dev 起名乱来,日积月累 Flag Service 像个垃圾场。

**避坑**:**强制命名规范**:

```
格式:<type>_<service>_<feature>_<version>

示例:
  release_order_new_checkout         (Release 类型,order 服务,新结算,无版本)
  experiment_search_recsys_v2        (Experiment 类型,search 服务,推荐 v2)
  ops_payment_kill_switch            (Ops 类型,支付服务,熔断开关)
  permission_user_premium_features   (Permission 类型,用户系统,Premium 功能)

规则:
  - 全小写 + 下划线
  - 不要带日期(到期日在 metadata 里,不要塞进名字)
  - 不要带"new" / "v2"(每个 flag 上线都是 new,意义不大)
  - 名字描述"做什么",不要描述"什么状态"
```

### 10.7 删 Flag 漏删 if 分支

**症状**:Flag 在 UI 里 archive 了,代码里 `if flag.is_enabled(...)` 还在,SDK 评估失败警告每秒刷屏。

**根因**:**只 archive 不 删代码**(或反过来),两边没同步。

**避坑**:**"删 flag" 的标准操作流程**:

```
Step 1   Flag UI 设为 100% 启用(不再是灰度规则)
Step 2   等 1 周,确认没人投诉
Step 3   提 PR:
          - 删 code 里的 if flag.is_enabled(name, ...)
          - 删 fallback / old 分支
          - 注释里说明这个 flag 已被永久启用,代码已合并
         CI 通过,review 通过,merge
Step 4   PR deploy 到生产
Step 5   Flag UI archive this flag
Step 6   1 个月后检查没有 SDK 还在评估这个 flag,真删除
```

**任何"少做一步"的方式都会留坑**——这套流程不能省。

---

## 十一、小结

1. **Feature Flag 是发布与启用的解耦**——代码 deploy 不等于功能 release,这件事的价值远超"灰度"
2. **核心价值四件**:解耦发布与启用 / 精细化灰度 / 应急熔断 / A/B 实验,**Kill Switch 是最被低估的**
3. **选型决策**:中型团队首选 OpenFeature + Unleash 自托管,跨大客户 / 多 SaaS 用 LaunchDarkly,小团队几个 flag 用自建
4. **灰度维度**:用户 ID hash 是基础(必须用稳定 key + per-flag salt),地域 / 设备 / 版本 / 租户是组合
5. **Flag 类型四种**:Release(短期,放完就删) / Experiment(中期,实验结束就删) / Ops(长期,定期演练) / Permission(早期可以,稳定后迁权限系统)
6. **治理三件套**:owner / 到期日 / 季度清理——**不治理就死于僵尸**
7. **删 flag = 真删代码**——不只是改 UI 的默认值,要真删 if 分支
8. **Flag 和金丝雀正交配合**——金丝雀控实例,Flag 控启用,两件事独立节奏

最后给一个硬指标:**看完这一篇,你应该能在白板前讲清「Flag 的生命周期管理」**——从 PR 提出加 flag → owner 填表 → 到期日 → 灰度放量 → 100% 验证 → PR 删代码 → archive flag。这一整套流程**任何一环缺失,都会让团队累积技术债**。**Flag 不是工具,是工程纪律**——上不上工具不重要,重要的是有没有这套纪律。

---

下一篇:**`23-数据库变更与发布耦合.md`**——发布工程这一层最难、也最容易翻车的一篇。代码可以快速 rollback,**数据回不去**——这是与前两篇本质不同的"不可逆性"。讲清楚 in-place DDL 为什么是地雷、`pt-online-schema-change` / `gh-ost` 怎么避开 DDL 锁、PostgreSQL 的 `CREATE INDEX CONCURRENTLY` 怎么用、**Expand-Contract 模式**怎么把"加字段 / 改字段 / 删字段"拆成多次发布让代码 / schema / 数据三件事永远兼容——会用 `users.email → email + email_verified` 拆字段的完整 5 步序列讲透。这是 100 微服务团队 1 年内必撞的事,**不讲清楚这一篇,前 22 篇白讲**。
