# Runbook 与告警自愈:一个告警一份手册 / 自动化执行步 / 何时升级

上一篇讲清楚了「人怎么轮值」。这一篇讲的是**告警响起、人接管之后,他手里到底有什么**——答案是 Runbook。**没有 Runbook 的 On-call 等于把人当 Google 用**:凌晨三点被叫起来,睁着眼盯 Grafana,用脑子推导"这个指标涨了应该看哪个 panel",**这不是工程,是体力劳动**。

> 一句话先记住:**告警的真正成本不是"配置告警"那一刻,是"半夜三点不知道这条告警该怎么处置"的那 30 分钟**——前者一次性,后者每次告警都付一遍。Runbook 把那 30 分钟从"猜测 + 求救 + Google"压缩成"打开 Runbook → 复制命令 → 跑"的 5 分钟。**没有 Runbook 的告警和没有的告警差别不大**,因为前者只是"系统知道有事"而没人能处理。这一篇这一层**最实用**的一篇——上一篇是制度,下一篇是容量,只有这一篇你看完明天就能落地。

---

## 一、问题场景:Runbook 缺失的两种死法

### 1.1 死法一:告警有,文档没有

```
凌晨 3:00,Slack #alerts 群里弹出:

  [P1] order-service: PaymentLatencyP99High
       p99 = 4.2s (threshold 1s) for 5min
       Runbook: <not set>     ← 这就是问题
```

值班人面对的局面:

```
1. 这个告警是啥意思?P99 高就高了,影响什么?
2. 该看哪个 dashboard?5 个 Grafana 大盘都有 order
3. 该跑什么命令?kubectl 看 pod?还是看 Redis?还是看 MySQL?
4. 怎么知道是恢复了还是恶化了?指标多久会跌回去?
5. 修不好我该叫谁?
```

**值班人开始 Google + 翻 wiki + @所有人**——MTTR 从理论的 15 分钟变成 90 分钟,凌晨 4:30 才搞定。**真正消耗的不是事故本身,是"我不知道这事故是啥"的认知成本**。

### 1.2 死法二:文档有,但是 wiki 不是脚本

```
打开 Confluence 上的 Runbook:

  ## PaymentLatencyP99 告警处理

  ### 1. 检查数据库
  登录 MySQL 看下慢查询日志,如果有慢查询就 kill 掉

  ### 2. 检查 Redis
  看下 Redis 内存是否满了

  ### 3. 检查下游
  看下支付网关响应时间

  ### 4. 重启服务
  如果以上都没用,重启服务
```

这种 Runbook 的问题不是"不全",是"**不可执行**":

```
"登录 MySQL"   —— 哪个 MySQL?用什么账号?跳板机怎么走?
"看下慢查询"   —— 看什么字段?阈值多少?哪些是正常哪些不正常?
"kill 掉"      —— 用什么命令?会不会误杀业务?
"重启服务"     —— 重启哪个服务?滚动重启还是直接重启?会不会丢数据?
```

**凌晨 3 点你没有时间"理解"Runbook**——你需要的是**复制粘贴可执行的命令**,带着具体的参数、具体的阈值、具体的下一步分支。

---

## 二、Runbook 是什么:工程视角的定义

### 2.1 Runbook ≠ Wiki / Doc

```
Wiki / 文档:
  - 给"想了解"的人看
  - 解释概念、讲背景、谈架构
  - 完整、详细、可读

Runbook:
  - 给"凌晨三点要修"的人看
  - 提供命令、阈值、判断分支
  - 简洁、可执行、可复制

差别像菜谱 vs 美食杂志:
  美食杂志:这道菜有 800 年历史,某朝某代某皇帝爱吃,做法精妙在 XX
  菜谱:    1. 牛肉 500g 切 2cm 块  2. 油锅 180°C 炸 90s  3. 加酱油 30ml
```

**Runbook 是菜谱,不是杂志**。

### 2.2 一个告警一份 Runbook

```
告警工程的铁律:
  ✗ 没 Runbook 的告警不应该上 prod
  ✗ 复用 Runbook 的告警等于没 Runbook
  ✓ 每条告警 link 到一个具体 Runbook
```

**为什么不能复用**:看上去 `Service5xxHigh` 和 `Service4xxHigh` 都是"服务有错误",但处置完全不同——4xx 通常是客户端问题(WAF / 鉴权 / 业务异常),5xx 通常是服务端问题(代码 bug / 容量 / 下游)。**复用 Runbook = 误导值班人**。

Prometheus 告警里 link Runbook 的标准做法:

```yaml
# alert_rules.yaml
groups:
  - name: order-service
    rules:
      - alert: OrderServiceLatencyHigh
        expr: |
          histogram_quantile(0.99,
            rate(http_request_duration_seconds_bucket{service="order"}[5m])
          ) > 1
        for: 5m
        labels:
          severity: P1
          team: order
        annotations:
          summary: "Order service P99 latency > 1s"
          description: "Current P99 = {{ $value }}s"
          runbook_url: "https://runbooks.internal/order/latency-high"
          dashboard: "https://grafana.internal/d/order-overview"
```

**`runbook_url` 是 annotation 的必填字段**——CI 时校验,没填的告警 PR 不让合。

---

## 三、Runbook 模板:6 个固定段落

```
┌──────────────────────────────────────────────────────┐
│  Runbook 标准结构(每节都不能省)                     │
├──────────────────────────────────────────────────────┤
│  1. 告警含义       — 这条告警在说什么               │
│  2. 影响范围       — 用户感知 / 业务影响             │
│  3. 排查步骤       — 按顺序看哪些指标                │
│  4. 修复步骤       — 具体命令,有分支                │
│  5. 升级条件       — 什么时候叫人                    │
│  6. 关联资源       — Dashboard / Wiki / Postmortem  │
└──────────────────────────────────────────────────────┘
```

让我用一个真实场景把这 6 段都填出来。

### 3.1 一份真实 Runbook 范例

```markdown
# RB-ORDER-001: Order Service 5xx Rate High

## 1. 告警含义
order-service HTTP 5xx 占比 > 1% 持续 3min。
触发条件:`sum(rate(http_requests_total{service="order",status=~"5.."}[3m]))
          / sum(rate(http_requests_total{service="order"}[3m])) > 0.01`

## 2. 影响范围
- 用户:订单创建/查询接口失败,影响下单流程
- 业务:每 1% 5xx ≈ 损失 ¥20k/小时收入(2024 数据)
- 上游:商品页/购物车不受影响,支付/物流可能间接影响
- SLO:错误预算燃烧率 14x → 1 小时烧完 28 天预算

## 3. 排查步骤(从快到慢)

### 3.1 先看 Dashboard:order-overview
打开 https://grafana.internal/d/order-overview
重点看:
  ✓ Error Rate panel:5xx 集中在哪个 endpoint?
  ✓ Latency panel:P99 是否同时飙升?
  ✓ Pod Status panel:Pod 重启数 / CrashLoopBackOff
  ✓ Dependencies panel:Redis / MySQL / Payment 响应时间

### 3.2 看下游是否健康
```bash
# 在 kubectl 跳板机执行
kubectl --context prod-cn -n order get pods -l app=order-service
# 期望:Running 数 == Desired,无 Restarts 飙升

# 看最近 5 分钟的 ERROR 日志
kubectl logs -n order -l app=order-service --since=5m | grep -i "error\|exception" | head -50

# 看下游连接池状态
kubectl exec -n order deploy/order-service -- \
  curl -s localhost:8080/actuator/metrics/hikaricp.connections.active
# 期望:active < 80% of max(50);如果 == max,池满了
```

### 3.3 看 MySQL 是否慢查询
```bash
# 跳板机
mysql -h prod-cn-rds-order.internal -u readonly -p$(vault kv get -field=password secret/mysql/order)
mysql> SELECT * FROM sys.processlist
       WHERE state != 'Sleep' AND time > 5
       ORDER BY time DESC LIMIT 10;
```

### 3.4 看 Payment 网关
```bash
curl -s https://payment.internal/health | jq
# 看 latency_p99 < 500ms
```

## 4. 修复步骤(按"最可能 → 最破坏"排序)

### 4.1 场景 A:某个 Pod CrashLoopBackOff
```bash
# 看是哪个 Pod 在挂
kubectl get pods -n order -l app=order-service | grep -v Running

# 看 crash 原因
kubectl describe pod <pod-name> -n order
kubectl logs <pod-name> -n order --previous | tail -100

# 如果是 OOM:临时扩容
kubectl scale deploy/order-service -n order --replicas=20
# 然后开 ticket:OOM 根因 + 调整 memory limit

# 如果是配置错误:rollback
kubectl rollout undo deploy/order-service -n order
```

### 4.2 场景 B:数据库慢查询拖累
```bash
# 找出 SLOW SQL
mysql> SELECT id, time, info FROM information_schema.processlist
       WHERE command != 'Sleep' AND time > 10;

# kill 单条慢 SQL(谨慎,可能丢业务)
mysql> KILL <process_id>;

# 临时加索引(只在 staging 验证过的情况下)
# !!! 切勿在 prod 直接 ALTER TABLE,用 gh-ost(参考 23 篇)
```

### 4.3 场景 C:下游 Payment 超时
```bash
# 启用降级开关(Feature Flag)
curl -X POST https://flag.internal/api/flags/payment-degrade-mode \
  -d '{"enabled":true,"reason":"P0-20260511"}'

# 验证生效
curl -s https://order.internal/api/order/create -d '{...}' | jq .meta.degraded
# 期望:true
```

### 4.4 场景 D:实在定位不了,先 rollback
```bash
# 看最近 30 分钟的发布
kubectl rollout history deploy/order-service -n order

# 如果 30min 内有发布:rollback
kubectl rollout undo deploy/order-service -n order
# 等待 2min,重新观察 5xx 率
```

## 5. 升级条件
触发以下任一条件 → 立即升级到 SRE Lead + Manager:
- 5xx 率持续 > 5% 超过 10min
- 4.1-4.4 全部尝试无效
- 涉及 MySQL 主库 / DR 切换(必须 DBA 在场)
- 影响其他团队的服务(Payment / 物流)

## 6. 关联资源
- Dashboard: https://grafana.internal/d/order-overview
- 服务负责人: @张三 @李四
- 上次 P0 Postmortem: https://postmortem.internal/2024-11-order-5xx
- 历史发布: https://argo.internal/applications/order-service
- DBA on-call: PagerDuty schedule "dba-rotation"
```

**这一份 Runbook 的关键设计**:

1. **从快到慢排查**(先看 dashboard 再看日志再看 DB),不让人一上来就跑重命令
2. **从可能 → 破坏 排序修复**(先重启 Pod、再 kill SQL、最后 rollback),不一上来就 rollback
3. **每个命令都带参数**(`-n order --since=5m`),不是 "kubectl logs 看看"
4. **升级条件具体**(5% / 10min,不是"严重时升级")

---

## 四、Runbook 放哪里:不要放 Confluence

### 4.1 Confluence 的死亡 4 连

```
凌晨 3:00 你被叫醒,要查 Runbook:

  1. 打开 Confluence → SSO 跳转 → 超时 → 重试
  2. 终于登进去 → 搜索 "PaymentLatency"
     → 出来 5 个版本,你不知道哪个是最新
  3. 点开 → "This page has been moved" → 跟着链接跳了 3 次
  4. 最终页面 → 上次更新 2023-04(已经过期 2 年)

总耗时:8 分钟还没看到正文
```

**Confluence 的问题**:

- **登录路径长**——SSO + MFA,凌晨手机操作累
- **搜索差**——同名页面、版本混乱
- **离线不可用**——网络断了就完蛋
- **没有 Git 历史**——谁改的、什么时候改的、为什么改的,全是黑箱
- **不能自动校验**——里面的命令是不是还能跑,没人知道

### 4.2 Runbook as Code:放 Git

```
推荐方案:
   ├── 公司 GitLab/GitHub 仓库 runbooks/
   │     ├── order/
   │     │     ├── RB-ORDER-001-5xx-high.md
   │     │     ├── RB-ORDER-002-latency-high.md
   │     │     └── RB-ORDER-003-db-conn-pool.md
   │     ├── payment/
   │     ├── user/
   │     └── _template.md
   │
   └── 静态站点(Hugo / mkdocs)发布
         → https://runbooks.internal/order/RB-ORDER-001
         → 静态 HTML,无登录,凌晨秒开
         → 全文搜索靠 Algolia / lunr.js
```

**Git 的好处**:

- 每次 Runbook 改动都是 PR,有 review、有历史
- Postmortem 后的"改进 Runbook"作为 PR 链接到事故,**可追溯**
- CI 校验 Runbook 里的命令(下面 §5 会讲)
- 离线 clone 一份在本地,凌晨断网也能看

### 4.3 一个团队的真实迁移路径

```
阶段 1(开始):Confluence,几十份散在各角落
阶段 2(痛过):Git 仓库 runbooks/,Markdown,人工维护
阶段 3(成熟):Git + 静态站 + CI 校验 + 自动从告警跳转
阶段 4(进阶):部分 Runbook 升级为 "可执行"(下面 §6)
```

**别一上来就追求阶段 4**——阶段 2 已经比 Confluence 强 10 倍。

---

## 五、Runbook 的 CI 校验:让文档不过期

文档最大的敌人是"老化"——半年没人看,里面的命令早就不能跑了。**CI 校验**让 Runbook 跟代码一样"必须能编译":

### 5.1 校验维度

```yaml
# .github/workflows/runbook-check.yml
name: Runbook Validation
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      # 1. 结构校验:每份 Runbook 必须包含 6 个 section
      - run: python scripts/runbook_lint.py
      
      # 2. 链接校验:Grafana / Dashboard / Postmortem 链接可达
      - run: python scripts/check_links.py runbooks/
      
      # 3. 命令语法校验:kubectl / mysql / curl 能 parse
      - run: bash scripts/lint_commands.sh runbooks/
      
      # 4. 告警-Runbook 配对校验:每条 alert 都有 runbook_url
      - run: python scripts/check_alert_runbook_pairing.py
      
      # 5. 过期检查:任何 Runbook 6 个月没改 → 警告
      - run: python scripts/check_staleness.py --max-age-days=180
```

### 5.2 Runbook-Alert 配对的硬约束

```python
# scripts/check_alert_runbook_pairing.py(简化版)
import yaml, glob, sys

alerts = []
for f in glob.glob("alerts/*.yaml"):
    rules = yaml.safe_load(open(f))
    for group in rules.get("groups", []):
        for rule in group.get("rules", []):
            if "alert" in rule:
                url = rule.get("annotations", {}).get("runbook_url")
                if not url:
                    print(f"FAIL: {rule['alert']} 缺 runbook_url")
                    sys.exit(1)
                # 校验 URL 对应的文件存在
                # ...
```

**CI 一旦不通过,PR 不让合并**——这是把"必须写 Runbook"做成工程硬约束,不是"友善提醒"。

---

## 六、告警自愈:好工具是仆人,坏工具是炸弹

写 Runbook 写多了,会发现很多步骤是"复制粘贴 + 执行"的固定动作——既然如此,**能不能让机器代劳**?这就是告警自愈。

### 6.1 自愈的层级

```
┌────────────────────────────────────────────────────┐
│  自愈的 3 个层级(从被动到主动)                     │
├────────────────────────────────────────────────────┤
│  L0: Liveness/Readiness Probe                      │
│      K8s 自动重启不健康 Pod                          │
│                                                    │
│  L1: HPA / VPA / Cluster Autoscaler                │
│      自动扩缩容,应对流量变化                        │
│                                                    │
│  L2: 自动 Rollback                                  │
│      发布后 5xx 飙升 → ArgoCD 自动回滚              │
│                                                    │
│  L3: 自定义自愈脚本                                  │
│      告警触发 → Kubernetes Job / Lambda → 跑脚本    │
│                                                    │
│  L4: ChatOps 半自动                                 │
│      告警发到群 → 机器人附按钮"一键修复"            │
│      → 人点确认 → 跑脚本                            │
└────────────────────────────────────────────────────┘
```

**L0/L1/L2 是"内置自愈",几乎所有 K8s 团队都该开**;L3/L4 是"业务自愈",需要工程投入。

### 6.2 自愈架构

```
┌─────────────────────────────────────────────────────────┐
│                  自愈系统架构                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Prometheus ──→ Alertmanager ──→ Webhook              │
│                                       │                 │
│                            ┌──────────┴──────────┐      │
│                            │                     │      │
│                       通知层(人)          自愈层(机器)│
│                       ↓                     │           │
│                   PagerDuty             ┌───┴───┐       │
│                   钉钉/飞书              │ Rules │       │
│                                        │ Engine │       │
│                                        └───┬───┘       │
│                                            │           │
│                              ┌─────────────┼─────────┐ │
│                              ▼             ▼         ▼ │
│                          kubectl       SQL kill   重启脚本│
│                                                         │
└─────────────────────────────────────────────────────────┘

关键设计:通知层和自愈层并行 —— 机器在修,人也在看
```

### 6.3 一个最小自愈例子:Pod 频繁重启 → 扩容

```yaml
# 告警规则
- alert: PodHighRestartRate
  expr: |
    rate(kube_pod_container_status_restarts_total[15m]) > 0
    and on(pod, namespace)
    kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"} == 1
  for: 5m
  labels:
    severity: P1
    auto_remediate: "scale-up"
  annotations:
    runbook_url: "https://runbooks/RB-K8S-001"
```

```python
# remediation_handler.py(收 Alertmanager webhook)
@app.route("/webhook", methods=["POST"])
def webhook():
    alert = request.json["alerts"][0]
    if alert["labels"].get("auto_remediate") == "scale-up":
        deploy = alert["labels"]["deployment"]
        ns = alert["labels"]["namespace"]
        # 1. 先看当前副本数
        current = get_replicas(deploy, ns)
        if current >= MAX_REPLICAS:
            notify_oncall(f"{deploy} 已达上限 {MAX_REPLICAS},不再自动扩容")
            return
        # 2. 扩 1.5 倍,留余地
        new = min(int(current * 1.5), MAX_REPLICAS)
        kubectl_scale(deploy, ns, new)
        # 3. 通知 on-call 群,留 paper trail
        post_to_slack(f"AUTO: scaled {deploy} {current} → {new}")
        # 4. 开 ticket 让人复盘根因
        create_jira(f"Auto-remediation triggered on {deploy}", ...)
```

**关键设计**:

1. **有上限**(MAX_REPLICAS),防止失控扩容把节点资源耗光
2. **留 paper trail**(Slack + Jira),让人事后知道发生了什么
3. **触发自愈 ≠ 关闭告警**——人还要看根因,告警照样发到 PD

---

## 七、自愈的边界:什么绝对不能自动

**这一节比上一节重要**。我见过太多团队"自愈做的太多",反而比没自愈更糟。

### 7.1 自愈的红线

```
┌────────────────────────────────────────────────────────┐
│  绝对不能自动的操作:                                    │
├────────────────────────────────────────────────────────┤
│  ✗ 数据库主从切换                                       │
│    误判一次 → 主库降级 → 数据双写冲突 → 业务崩       │
│                                                        │
│  ✗ 跨可用区切换                                         │
│    切错了 → 流量打到挂的可用区 → 雪上加霜            │
│                                                        │
│  ✗ 删数据 / 删 Pod 持久卷                              │
│    自愈把"脏数据"清掉 → 这下真的没了                  │
│                                                        │
│  ✗ DNS 切换 / TLS 证书更新                             │
│    出错的影响半径太大,且回滚成本高                    │
│                                                        │
│  ✗ 网络隔离修复(防火墙规则改动)                       │
│    可能把"防御"误判成"故障",自己开门给攻击者         │
│                                                        │
│  ✗ 任何"不可逆"操作                                    │
│    truncate / drop / delete from / 移文件 等          │
└────────────────────────────────────────────────────────┘
```

### 7.2 自愈的安全边界:可以做的

```
✓ 重启 Pod / Container       —— K8s 已经内置
✓ HPA 扩容(有上限)         —— 几乎无副作用
✓ 清理日志 / 临时文件         —— 风险低
✓ Cache 刷新                  —— 最多缓存 miss 一下
✓ 自动 Rollback(有看护期)  —— ArgoCD 内置
✓ 限流开关打开                —— 防雪崩,可立即关
```

### 7.3 决策矩阵:这个动作该不该自动

```
                  | 风险高    | 风险低
──────────────────┼──────────┼──────────
可逆(能撤销)    | 半自动    | 全自动
                  | (要按钮) |
──────────────────┼──────────┼──────────
不可逆(撤不回)  | 永不自动  | 极少全自动
                  |          | (除非充分测试)
```

**一个简单的自检**:**这个动作如果做错了,我能在 5 分钟内撤回吗**?能 → 可以自动;不能 → 必须人按按钮。

---

## 八、可执行 Runbook:从文档到代码

Runbook 进化的终态是"**可执行**"——文档里的步骤不仅描述操作,**还能直接跑**。

### 8.1 三种实现方式

| 工具 | 形式 | 适用场景 |
| --- | --- | --- |
| **Jupyter Notebook** | Python + Markdown 混排,值班人浏览器里跑 cell | 数据查询、临时分析、ML 类自愈 |
| **Ansible Playbook** | YAML 描述步骤,`ansible-playbook` 跑 | 多机批量操作、配置变更 |
| **Robot Framework** | 关键字驱动,可读性最强 | 复杂多步流程、回归测试 |
| **kubectl + bash 脚本** | 最简单粗暴 | K8s 内大部分操作 |
| **Argo Workflow / Tekton** | DAG 工作流,K8s 原生 | 跨多步骤、有分支 |

### 8.2 Jupyter 风格的 Runbook 示例

```python
# notebook: RB-ORDER-001-investigation.ipynb

# Cell 1: 看当前 5xx 率
import requests
url = "https://prometheus.internal/api/v1/query"
q = 'sum(rate(http_requests_total{service="order",status=~"5.."}[3m])) / sum(rate(http_requests_total{service="order"}[3m]))'
r = requests.get(url, params={"query": q}).json()
print(f"当前 5xx 率: {float(r['data']['result'][0]['value'][1])*100:.2f}%")

# Cell 2: 看是哪些 endpoint 在 5xx
q = 'sum by(endpoint) (rate(http_requests_total{service="order",status=~"5.."}[3m]))'
# ... 同上,出来一个表

# Cell 3: 看 Pod 状态
from kubernetes import client, config
config.load_kube_config(context="prod-cn")
v1 = client.CoreV1Api()
pods = v1.list_namespaced_pod("order", label_selector="app=order-service")
for p in pods.items:
    print(f"{p.metadata.name}: {p.status.phase}, restarts={sum(c.restart_count for c in p.status.container_statuses)}")

# Cell 4: 修复决策树
"""
如果 Pod restarts 高 → 跑 Cell 5(扩容)
如果 DB 慢 → 跑 Cell 6(看慢查询)
如果都不是 → 跑 Cell 7(rollback)
"""

# Cell 5: 扩容
# ... 用 client.AppsV1Api 修改 replicas
```

**这种 Runbook 的优势**:

1. **结果实时可见**——不用切窗口去 Grafana
2. **历史可追溯**——每次事故的 notebook 自动保存,事后复盘直接看
3. **版本化**——和 Git 仓库一起管理

**踩坑提醒**:**Jupyter Runbook 别给新人用**——风险是"按了 Cell 不知道在干啥"。**只给熟练值班人用,新人还是先用 Markdown 版本**。

### 8.3 一个真实的反例:Runbook 写错了

某团队真实事故,这个例子值得每个 SRE 看:

```
背景:
  - 某 Java 服务有内存泄漏倾向,运行 7-10 天会 OOM
  - 团队做了两件事:
    (1) K8s 设了 OOMKilled 自动重启(Liveness probe)
    (2) Runbook 里加了一条"如果内存使用 > 80%,执行 kubectl delete pod"

事故:
  - 某天告警"内存使用 82%"
  - 值班人按 Runbook 走,kubectl delete pod
  - Pod 重启,30 秒后服务恢复
  - 但是!这个服务有个 in-memory cache,
    冷启动需要从 MySQL 拉 100MB 数据预热(耗时 2min)
  - 重启过程中:50% 请求打到老 Pod(在 terminate),
    50% 打到新 Pod(还在预热,5xx)
  - 5 分钟内 5xx 率从 0 飙到 30%
  - 真正的 P0 出现了

根因分析:
  - K8s OOMKilled 自动重启本来 7 天一次,业务能扛
  - 但 Runbook 让值班人在 OOM 前手动 delete,
    一周可能 delete 3-4 次,每次都是一次小事故
  - "好心办坏事":本意是避免 OOM,
    实际是把"自动重启"重复触发,reset 了关键缓存状态

教训:
  ✗ Runbook 写"kubectl delete pod"前,
    必须问"K8s 自动重启不已经在做这件事了吗"
  ✗ 自动机制和人工 Runbook 重叠 = 浪费 + 危险
  ✓ Runbook 应该写"如果 LivenessProbe 没工作,人为 delete pod"
    带上判断条件,不是无脑执行
```

**这个反例告诉我们**:

1. **Runbook 不是"看到 X 就做 Y"**,而是"看到 X 且 Y 没做就做 Z"
2. **写 Runbook 前必须懂底层机制**——K8s 已经在做什么、为什么这么做
3. **重启之类的"重操作"必须有冷却时间**(`if last_restart > 30min`)

---

## 九、Runbook 的指标:让"覆盖率"可量化

### 9.1 4 个核心指标

```
┌──────────────────────────────────────────────────────┐
│  Runbook 工程的健康指标                              │
├──────────────────────────────────────────────────────┤
│  1. 覆盖率                                            │
│      = 有 Runbook 的告警 / 总告警                     │
│      目标:> 90%                                      │
│                                                      │
│  2. 使用率                                            │
│      = 事故里实际打开 Runbook 的次数 / 事故总数       │
│      目标:> 70%                                      │
│      (说明 Runbook 真有用,不是写来摆设)            │
│                                                      │
│  3. 平均事故处理时间(用 Runbook)                    │
│      = MTTR 中 Runbook 占用时间                       │
│      目标:< 总 MTTR 的 40%                          │
│                                                      │
│  4. Runbook 新鲜度                                    │
│      = 最近 90 天内更新过的 Runbook 占比             │
│      目标:> 60%                                      │
│      (老化的 Runbook = 信任崩塌)                    │
└──────────────────────────────────────────────────────┘
```

### 9.2 怎么测使用率

让 Runbook 站点埋 GA / 自建埋点:

```python
# runbooks 站点中间件
@app.route("/<service>/<rb_id>")
def view_runbook(service, rb_id):
    # 记录:谁、什么时候、什么告警触发的访问
    incident_id = request.args.get("incident_id")
    track_event({
        "user": current_user.email,
        "runbook": f"{service}/{rb_id}",
        "incident_id": incident_id,
        "timestamp": datetime.utcnow(),
    })
    return render(...)
```

**Runbook 链接里带 `?incident_id=` 参数**,告警跳转时自动带上——这样可以反查"哪个事故用了哪份 Runbook、用了几次"。

### 9.3 没人用的 Runbook 比没 Runbook 还糟

```
反例:
  - 团队 1 年写了 200 份 Runbook
  - 实际事故里只有 30 份被打开过
  - 其他 170 份:写完没人看 → 没人维护 → 老化 → 出事更乱

正确做法:
  - 用使用率排序
  - 长期 0 使用 → 评估是不是告警本身就该删
  - 高使用 → 优先优化,争取做成可执行
```

---

## 十、Runbook 工程的 5 个反模式

```
反模式 1:Runbook 在 Confluence
    → 凌晨打不开 / 无法离线 / 搜索差
    
反模式 2:Runbook 写成 "wiki"
    → "重启服务"(哪个?用什么命令?)
    
反模式 3:Runbook 半年没更新
    → 命令早过期,跑出来报错让值班人更慌
    
反模式 4:一份 Runbook 覆盖多种告警
    → 看 Runbook 比看告警还累
    
反模式 5:Runbook 写完没人审
    → 误导值班人,出事不知道是 Runbook 错还是操作错
```

---

## 十一、何时不该上 Runbook 工程

### 11.1 团队太小

```
< 3 人团队:
  - 服务 < 10 个
  - 告警 < 50 条
  - 大家都在群里
  → 写 Runbook 的工程成本 > 收益
  → 把告警链接到 README 里写两行就行
```

### 11.2 服务太新 / 太短命

```
新服务(< 3 个月):
  - 还在快速迭代,告警阈值经常调
  - 写细致 Runbook 一周就过期
  → 先写"草稿版"(2-3 行),稳定后再细化

实验项目:
  - 6 个月内可能下线
  → 别投入,出事直接喊作者
```

### 11.3 不该写 Runbook 的告警

```
该删的告警,不是该写 Runbook 的:
  ✗ 长期 0 触发(写了浪费)
  ✗ 长期高误报(看 15 篇)
  ✗ 触发了也没人能处置(那为啥告警)
  ✗ 触发了但用户无感(降级或删)
```

**Runbook 工程的目的不是"写满文档",是"让能处理的告警都能被快速处理"**——告警本身就该删的,不要给它写 Runbook 续命。

---

## 十二、Runbook 工程落地路线图

把这一篇所有内容浓缩成一个 4 阶段路线:

```
┌──────────────────────────────────────────────────────┐
│  阶段 1(第 1-2 周):打地基                          │
│   - 列出所有 P0/P1 告警(40 条以内)                 │
│   - 每条告警写一份最小 Runbook(6 段结构)            │
│   - 放 Git 仓库 + 静态站                              │
│   - 告警 runbook_url 链上                            │
│                                                      │
│  阶段 2(第 3-6 周):工程化                          │
│   - CI 校验:每条告警必须有 Runbook                  │
│   - 站点全文搜索                                      │
│   - Runbook PR 流程 + Review 制度                    │
│   - 季度 Review:用使用率筛选                         │
│                                                      │
│  阶段 3(第 2-3 个月):自愈起步                      │
│   - 配 K8s Liveness/Readiness Probe                  │
│   - 开 HPA + 设上限                                  │
│   - ArgoCD 自动 rollback(有看护期)                 │
│                                                      │
│  阶段 4(第 4-6 个月):可执行 Runbook                │
│   - 高频 Runbook 改成 Jupyter / 脚本                 │
│   - 部分场景 ChatOps(机器人按钮)                    │
│   - GameDay 验证(参考 31 篇)                       │
└──────────────────────────────────────────────────────┘
```

**不要一上来跳到阶段 4**——80% 的团队卡在阶段 1 / 2,**先把"Runbook 在 Git、覆盖率 > 90%、没人写假文档"做扎实**,后面才有意义。

---

## 十三、踩坑提醒

1. **Runbook 在 Confluence** —— 凌晨打不开,等于没有
2. **Runbook 是 doc 不是脚本** —— "看下"、"检查下"、"重启下",**全是废话**
3. **复用 Runbook** —— 多种告警共用一份,等于没区分
4. **CI 不校验** —— 写不写 Runbook 全靠自觉,半年崩盘
5. **自愈滥用** —— DB 切换 / 删数据 / DNS 切都做自动,等炸
6. **自愈和 Runbook 重复** —— 上面那个 OOM delete pod 的反例
7. **不测使用率** —— 写了 200 份只用 30 份,白干 170 份
8. **新服务也死磕 Runbook** —— 服务还在改阈值,Runbook 一周一过期
9. **Runbook 半年不审** —— 命令早就跑不动,出事更慌
10. **Runbook 没绑事故** —— 出事看不出"是 Runbook 漏了还是值班人没看"
11. **可执行 Runbook 给新人用** —— 一键执行 = 一键炸
12. **告警没 runbook_url** —— 跳转链接断,值班人在 wiki 里搜半天

---

## 十四、本篇硬指标

看完这一篇,你应该能给团队:

- **挑一个 P1 告警,2 小时写出一份 6 段结构的 Runbook**(可以发表的水准)
- **在 CI 里加上"告警必须有 runbook_url"的校验**
- **画出团队"自愈的红线和绿线"**——什么动作可以自动,什么必须人按按钮
- **算出团队当前的 4 个 Runbook 指标**(覆盖率 / 使用率 / 处理时间 / 新鲜度)
- **指出团队当前 Runbook 的 1-2 个反模式**(几乎所有团队都至少有一个)

---

下一篇:`30-容量规划.md`,Runbook 解决了"事故来了怎么修",容量规划解决"事故为什么会来"——很多 P0 不是 bug,是"容量不够 + 流量来了",光修 bug 治不了根。下一篇接 backendLearning/36 压测,讲清楚单实例上限怎么测、容量公式怎么算、HPA 为什么经常救不了你(冷启动 5 分钟扛不住突发)、Pre-scale 比 HPA 安全在哪、容量水位告警的 60/70/80 三档怎么定。**有公式、有阈值、有取舍**——看完你应该能给自己负责的服务画出一条"未来 6 个月容量曲线"。
