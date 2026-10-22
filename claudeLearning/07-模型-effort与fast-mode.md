# 模型、effort 与 fast mode

同一个任务,换个模型、换个 effort,结果、速度、花费都可能差好几倍。Claude Code 里和"用什么脑子干活"相关的旋钮有好几个:**选哪个模型、想多深(effort)、要不要加速(fast mode)、要不要请一个更强的顾问(advisor)、出问题时退到哪个模型(fallback)**。这一篇把它们一个个讲清楚。

> 一句话先记住:**先选模型,再调 effort,最后才考虑 fast mode 和 advisor**。默认组合已经适合大多数日常工作;只有当你明确知道"这个任务需要更深"或"这个任务要更快"时,才去动它们。

---

## 一、模型别名

在 `/model`、`--model`、settings 的 `model` 里,推荐写**别名**而不是完整 ID:

| 别名 | 含义 |
| --- | --- |
| `opus` | 最新的 Opus,复杂推理 |
| `sonnet` | 最新的 Sonnet,日常编码 |
| `haiku` | Haiku,简单快速的任务 |
| `fable` | Fable 系列,最难、最长时间运行的任务 |
| `best` | 能用 Fable 就用 Fable,否则等同 `opus` |
| `opusplan` | plan mode 用 Opus,执行阶段换 Sonnet |
| `opus[1m]` / `sonnet[1m]` | 1M 上下文的变体(当前模型原生就是 1M 时无效果) |
| `default` | 清除覆盖,回到账号类型的默认模型 |

别名在不同服务商上解析到不同版本:

| 服务商 | `opus` | `sonnet` | `haiku` |
| --- | --- | --- | --- |
| Anthropic API | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
| Claude Platform on AWS | Opus 5.5 | Sonnet 4.6 | Haiku 4.5 |
| Amazon Bedrock、Google Cloud | Opus 5.5 | Sonnet 4.5 | Haiku 4.5 |
| Microsoft Foundry | Opus 4.6 | Sonnet 4.5 | Haiku 4.5 |

**别名会随新版本自动更新**。想钉死某个版本,就写完整 ID(比如 `claude-opus-5-5`),或者设 `ANTHROPIC_DEFAULT_OPUS_MODEL` 这类环境变量。

### 默认模型

`default` 在 Pro、Max、Team、Enterprise 和 Anthropic API 上解析为 **Opus 5.5**;Enterprise 管理员可以在后台为组织或角色指定默认模型。

Fable 不是任何计划的默认模型,要显式选:`/model fable`。部分计划下 Fable 的用量会计入额外的 usage credits,第一次使用时会请你确认。

### 版本要求

新模型往往要求较新的 Claude Code 版本(比如 Sonnet 5.5 需要 v2.1.284+、Opus 5.5 需要 v2.1.280+、Fable 5.1 需要 v2.1.257+)。报"不支持这个模型"时,先 `claude update`。

---

## 二、怎么选模型

| 模型 | 适合 |
| --- | --- |
| **Opus**(默认) | 大多数编码工作、需要判断的架构问题、复杂调试 |
| **Sonnet** | 节奏快、范围清晰的日常编码 |
| **Haiku** | 简单改动、批量的小任务、作为子代理干读文件和检索的活 |
| **Fable** | 超过"一次坐下来"能完成的任务:根因调查、线上故障、架构决策、长时间自主运行 |

用 Fable 的几个心法:

- **描述结果,别描述步骤**:告诉它你要什么,路径让它自己规划;配合 08 篇的 `/goal` 让它一直干到达成
- **交给它模糊的问题**:越是需要调查和验证的任务,Fable 的优势越明显
- **不用反复提醒它验证**:它会自己验证
- **任务可以给大一点**:平时要拆成几块的工作,可以整块交给它

### 切换的代价

`/model` 会立刻切换,并保存为新会话的默认值(在选择器里按 `s` 只对本次会话生效)。但**每个模型有自己的缓存,切过去的下一轮要把整个对话重新计费**。缓存还热的时候切换,Claude Code 会先问你确认。

---

## 三、effort:想多深

### 3.1 等级

effort 控制模型的自适应推理:每一步要不要想、想多少。等级越高,验证越充分、边界情况考虑越多,但更慢更贵。

| 模型 | 可用等级 | 默认 |
| --- | --- | --- |
| Opus 5.5、Sonnet 5.5、Haiku 5.5 | `low` `medium` `high` `xhigh` `max` | **`medium`** |
| Fable 5.1 / 5、Opus 5、Sonnet 5、Opus 4.8 | 同上 | `high` |
| Opus 4.7 | 同上 | `xhigh` |
| Opus 4.6、Sonnet 4.6 | `low` `medium` `high` `max` | `high` |

注意 **Opus 5.5 默认是 `medium`**,比 Opus 5 的默认低一级。官方测试里 Opus 5.5 的 `medium` 在编码和知识类评测上不输 Opus 5 的 `high`。同一个等级名在不同模型上对应的实际力度并不相同。

### 3.2 怎么选

| 等级 | 用在 |
| --- | --- |
| `low` | 每一步你都会看结果的快速来回:头脑风暴、初稿、改名这类小改动 |
| `medium` | 范围清晰的日常工程工作,比如实现一个新功能 |
| `high` | 需要验证、边界情况多的工作,比如在老代码里修 bug |
| `xhigh` | 更深的推理,更高的花费 |
| `max` | 想让它独立啃下来的难题,比如找安全漏洞。可能出现收益递减和过度思考,先试再推广 |

### 3.3 怎么设

- **`/effort`**:打开滑块;`/effort high` 直接设置;`/effort auto` 清除为当前模型保存的等级;`/effort status` 查看当前生效的等级
- **`/model` 选择器**里用左右键调
- **启动参数** `--effort high`;**环境变量** `CLAUDE_CODE_EFFORT_LEVEL`
- **settings**:`modelSettings` 里按模型分别保存,或者 `effortLevel` 作为没有单独设置的模型的默认值

在 `/effort` 里按回车会**保存为默认**,按 `s` 只对本次会话生效;`max` 除非用环境变量设置,否则只对本次会话生效。

### 3.4 一次性加深:ultrathink

只想让**这一轮**多想想,不改会话设置:在消息里任何位置写 `ultrathink`。

### 3.5 ultracode

`/effort` 滑块里还有一个 **Ultracode** 开关。它不是 effort 等级,而是一种工作方式:打开后,Claude 会为每个实质性任务规划一个 dynamic workflow,用多个子代理并行推进(17 篇)。

```
/effort ultracode       # 本次会话打开
/effort ultracode off   # 关闭
claude --effort ultracode   # 启动时打开,并把 effort 设为 xhigh
```

它会显著增加 token 消耗,适合大规模审计、迁移这类任务,不适合日常小改动。

### 3.6 thinking 的显示

推理过程默认折叠,按 `Ctrl+O` 切换 verbose 模式查看。`Option+T`(macOS)或 `Alt+T` 可以切换本次会话的 thinking 开关,但 **Opus 5.5、Sonnet 5.5、Haiku 5.5 和 Fable 系列的 thinking 关不掉**,只能通过降低 effort 来减少思考量。

---

## 四、fast mode:同一个 Opus,跑得更快

fast mode 不是另一个模型,而是 **Opus 的一种高速 API 配置**:输出速度最高约 2.5 倍,质量相同,单价更高。

| 模型 | 输入 / 输出(每百万 token) |
| --- | --- |
| Opus 5.5 | $8 / $40 |
| Opus 5、Opus 4.8 | $10 / $50 |

用法:

- `/fast` 打开或关闭,或在 settings 里设 `"fastMode": true`。打开后提示符旁边会出现 `↯`
- 当前模型不支持时,打开 fast mode 会自动切到 Opus;关闭后仍停留在 Opus
- 默认会在会话之间保留;可以配置成每次会话都要重新打开
- **订阅用户的 fast mode 只走 usage credits**,不计入订阅额度;Team / Enterprise 需要 Owner 先开启

两条使用建议:

1. **在会话开头打开**。第一次打开会让缓存失效一次,之后只是切换速度参数,不再影响缓存
2. **用在需要即时反馈的场景**:快速迭代、现场调试、结对式的来回。长时间无人值守的任务开 fast mode 只是多花钱

---

## 五、advisor:关键时刻请教更强的模型

advisor 让主模型在关键节点**咨询第二个、通常更强的模型**:决定方案之前、同一个错误反复出现时、宣布任务完成之前。advisor 能看到完整对话,给出建议,由主模型决定怎么做。

```
/advisor opus        # 设置并保存为默认
/advisor off         # 关闭
claude --advisor opus   # 只对本次会话
```

或者在 settings 里写 `"advisorModel": "opus"`。

几点限制:

- **实验性功能,只在 Anthropic API 上可用**,Bedrock、Google Cloud、Foundry、Claude Platform on AWS 都不支持
- advisor 必须**至少和主模型一样强**,排得比主模型低的会被忽略
- 它在服务端运行,没有可以写进权限规则或 hook 的工具名

和其他组合方式的区别:

| 方式 | 何时用第二个模型 |
| --- | --- |
| `opusplan` | 固定在 plan / 执行的边界切换 |
| advisor | 主模型自己判断什么时候需要请教 |
| 子代理指定模型 | 把某类子任务整个交给另一个模型 |

适合大部分步骤是常规操作、但**方案质量决定成败**的长任务:大重构、反复出现的疑难 bug、需要独立复核的交付。短任务用不上。

---

## 六、两种回退:模型不可用时 vs 请求被拦时

### 6.1 可用性回退:fallback 链

主模型过载或不可用时,按顺序换模型重试,**只对当前这一轮生效**,下一条消息又先试主模型:

```bash
claude --fallback-model sonnet,haiku
```

```json
{ "fallbackModel": ["sonnet", "haiku"] }
```

最多三个模型。认证、计费、限流、请求过大这类错误不会触发回退。压缩时不会退到上下文窗口更小的模型。启动时不会提示你配了回退链,第一次切换时的通知才是唯一信号。

### 6.2 内容回退:安全分类器拦截时

Fable、Opus 5.5、Sonnet 5.5、Opus 5 带安全分类器,最常拦截的是网络安全和生物学内容。被拦时会按类别换模型重跑:

| 被拦的模型 | 网络安全类 | 生物类 |
| --- | --- | --- |
| Fable 5.1 / 5、Opus 5.5 | 改用 Opus 4.8 | 改用 Opus 5 |
| Sonnet 5.5 | 改用 Sonnet 5 | 直接拒绝 |
| Opus 5 | 改用 Opus 4.8 | 直接拒绝 |

切换后**会话停留在回退模型上**,想回去要手动 `/model`;effort 保持原来的等级。想每次都先问你,在 `/config` 里把 "Switch models when a message is flagged" 设成 Ask each time。

> 做渗透测试、CTF、生物相关代码库时,第一条请求就可能被拦——因为第一条请求带着 CLAUDE.md 和 git 状态。这是正常的路由行为,不是账号被标记。用 `claude --safe-mode` 可以确认是不是你的定制内容触发的。

---

## 七、组织怎么管控模型

管理员在 managed settings 里可以:

- **`availableModels`**:限制可选模型,作用于 `/model`、`--model`、环境变量、子代理和 skill 指定的模型、advisor、fast mode 等所有能指定模型的地方
- **限制 effort 等级**:给某些模型设上限
- **设置组织默认模型**(Enterprise)
- 回退目标被 `availableModels` 排除时,不会发生回退,请求直接以拒绝结束

---

## 八、推荐组合

| 场景 | 配置 |
| --- | --- |
| 日常开发 | 默认的 Opus + 默认 effort |
| 快速小改、原型 | `sonnet` 或 `low` effort |
| 现场调试、快速来回 | 会话开头 `/fast` |
| 老代码里修疑难 bug | `high` 或 `xhigh` |
| 跨多天的大任务、根因调查 | `fable` + `/goal` |
| 长任务但只想在关键点用更强的模型 | 主模型 + `/advisor` |
| 大规模审计、迁移 | ultracode(注意用量) |
| 只是这一个问题想深一点 | 消息里写 `ultrathink` |

---

## 九、踩坑

1. **任务做到一半换模型**——下一轮整个对话重新计费。开头就定好
2. **以为 Opus 5.5 和 Opus 5 默认 effort 一样**——Opus 5.5 默认 `medium`,需要更深就显式调高
3. **settings 里写死完整模型 ID 然后忘了**——新模型发布后你还停在旧版本。日常用别名
4. **在 Bedrock / Foundry 上以为 `sonnet` 就是最新版**——那里解析到更老的版本,要用新版写完整 ID
5. **想关掉新模型的 thinking**——关不掉,用低 effort
6. **长时间无人值守任务开 fast mode**——没人等结果,加速只是多花钱
7. **一直开着 `max`**——收益递减、容易过度思考,先在具体任务上验证值不值
8. **把 ultracode 当成"更聪明的模式"常开**——它会派出大量子代理,日常小任务用它很浪费
9. **被内容回退切走了模型却没注意**——会话停留在回退模型上,用 `/model` 切回来
10. **在第三方云上配 advisor**——只有 Anthropic API 支持

---

下一篇:`08-Plan-Mode与goal.md`,讲 plan mode 的工作方式和方案审批,以及用 `/goal` 设定完成条件、让 Claude 一直干到达成。
