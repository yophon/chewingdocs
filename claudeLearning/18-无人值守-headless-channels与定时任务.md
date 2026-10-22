# 无人值守:headless、channels 与定时任务

到目前为止,Claude Code 基本都在"你打字、它回应"的节奏里工作。这一篇讲几种**不需要你在终端前一条条下指令**的用法:在脚本和 CI 里调用它、让外部系统把事件推进正在运行的会话、让它按间隔重复检查某件事、从一个链接直接打开一个预填好任务的会话。

> 一句话先记住:**无人值守的关键不是"让它跑起来",而是"没人回答弹窗时会发生什么"**。交互会话里遇到需要授权的操作会停下来等你;脚本里没有人,所以你必须事先决定:哪些放行、哪些交给分类器、哪些直接拒绝。

---

## 一、`claude -p`:非交互模式

### 1.1 基本用法

```bash
claude -p "auth 模块是做什么的?"
claude -p "找出并修复 auth.py 里的 bug" --allowedTools "Read,Edit,Bash"
```

加上 `-p`(`--print`),Claude Code 执行完任务就退出,结果打印到 stdout。**成功退出码为 0,失败非 0**,脚本可以据此分支。

它会读 stdin,所以能当普通命令行工具用:

```bash
cat build-error.txt | claude -p '简洁地解释这个构建错误的根本原因' > output.txt
```

stdin 上限 10MB,更大的内容写进文件,在 prompt 里引用路径。

塞进 `package.json` 当一个项目专属的检查器:

```json
{
  "scripts": {
    "lint:claude": "git diff main | claude -p \"你是错别字检查器。对 diff 里的每个错别字,一行写 文件名:行号,下一行写问题。不要输出别的。\""
  }
}
```

把 diff 通过管道喂进去,Claude 就不需要 Bash 权限去读它。

### 1.2 结构化输出

| `--output-format` | 结果 |
| --- | --- |
| `text`(默认) | 纯文本 |
| `json` | 结果 + 会话 ID + 用量 + 花费等元数据 |
| `stream-json` | 换行分隔的 JSON 事件流,实时输出 |

要求输出符合某个 schema:

```bash
claude -p "提取 auth.py 里主要函数的名字" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}'
```

结果在 `structured_output` 字段里。**用之前先检查这个字段存在**——Claude 拒绝请求等情况下不会有它。`json` 输出还带 `total_cost_usd` 和按模型拆分的花费,方便脚本统计开销。

### 1.3 权限:最需要想清楚的部分

**`-p` 默认是 Manual 模式,而没有人能回答弹窗**,所以需要授权的调用会被直接拒绝。几种做法:

| 做法 | 写法 | 适合 |
| --- | --- | --- |
| 精确放行 | `--allowedTools "Bash(npm test),Read,Edit"` | 你清楚它需要什么 |
| 交给分类器 | `--permission-mode auto` | 任务开放,不好预先列举 |
| 只做预先放行的 | `--permission-mode dontAsk` + `--allowedTools` | 锁死权限的 CI |
| 自动接受编辑 | `--permission-mode acceptEdits` | 只改文件的任务,如修 lint |

`--allowedTools` 用的是权限规则语法:

```bash
claude -p "看看暂存的改动,写一个合适的提交" \
  --allowedTools "Bash(git diff *),Bash(git log *),Bash(git status *),Bash(git commit *)"
```

**彻底无人值守时加 `--permission-prompts none`**:任何会弹窗的操作直接拒绝,并告诉 Claude 没人能批准、别重试;`AskUserQuestion` 这类需要人回答的工具会被移除。

```bash
claude -p "更新依赖版本并跑测试" --permission-mode auto --permission-prompts none
```

用 `stream-json` 时,被拒绝的调用会作为 `permission_denied` 消息出现,最终结果里汇总在 `permission_denials`。

### 1.4 `--bare`:可复现的干净运行

```bash
claude --bare -p "总结 README.md" --allowedTools "Read"
```

`--bare` 跳过所有自动发现:hooks、skills、自定义命令、子代理、插件、MCP server、auto memory、CLAUDE.md。效果是:

- **启动更快**
- **在每台机器上结果一致**:同事 `~/.claude` 里的 hook、项目 `.mcp.json` 里的 server 都不会生效
- **只认 API key**:不读订阅登录和系统钥匙串,要设 `ANTHROPIC_API_KEY`
- 需要的上下文通过参数显式传入:`--append-system-prompt`、`--settings`、`--mcp-config`、`--agents`、`--plugin-dir`
- 没有后台任务,超时的命令直接停止

> 一个安全上的理由:**不加 `--bare` 时,`-p` 会执行项目 `.claude/settings.json` 里的 hooks、连接 `.mcp.json` 里的 server——即使是一个你从没信任过的目录**,因为非交互模式没有信任弹窗。在 CI 里处理外部贡献的代码时尤其要注意。官方推荐脚本和 SDK 调用都用 `--bare`,它将来会成为 `-p` 的默认行为。

### 1.5 多轮与命令

```bash
claude -p "审查这个代码库的性能问题"
claude -p "现在专注数据库查询" --continue

session_id=$(claude -p "开始审查" --output-format json | jq -r '.session_id')
claude -p "继续" --resume "$session_id"
```

`-p` 里可以用你自己的 skill(在 prompt 里写 `/skill名`);`/model sonnet`、`/effort high` 这类命令以参数形式使用;只在终端界面里有意义的命令(如 `/login`)不可用。

---

## 二、Channels:把外部事件推进会话

### 2.1 是什么

channel 是一个**往你正在运行的会话里推送事件的 MCP server**。CI 失败、聊天消息、监控告警可以直接到达你已经开着的那个会话,Claude 读到后做出反应,还能通过同一个 channel 回复。

| 机制 | 方式 |
| --- | --- |
| 普通 MCP server | Claude 在任务中**主动去查**,没有推送 |
| 云端会话 / Slack | 为事件**新开一个**云端会话 |
| Remote Control | **你**从手机或浏览器操控本地会话 |
| **Channel** | **外部系统**把事件推进**你已经开着的**会话 |

研究预览阶段内置 Telegram、Discord、iMessage(都需要 Bun),也可以自己写。需要 claude.ai 或 Console 认证,Bedrock / Google Cloud / Foundry 上不可用。

### 2.2 以 Telegram 为例

```
/plugin install telegram@claude-plugins-official
/telegram:configure <从 BotFather 拿到的 token>
```

退出后带上 channel 参数重启:

```bash
claude --channels plugin:telegram@claude-plugins-official
```

在 Telegram 里给你的 bot 发条消息,它会回一个配对码,完成配对后就能在手机上给这个会话发指令了。Claude 通过 channel 回复时,终端里只显示一次工具调用和"已发送",回复内容出现在 Telegram 里。

### 2.3 安全

每个 channel 插件都维护一个**发送者白名单**,只有你加进去的 ID 能推送消息,其他人的消息被静默丢弃。Team / Enterprise 需要管理员先开启,并可以限制允许哪些 channel 插件。

自己写 channel:实现一个按 channel 协议推送事件的 MCP server,参考官方的 Channels reference。

---

## 三、`/loop` 与会话内定时任务

### 3.1 三种调度方式对比

| | 云端定时任务(19 篇) | Desktop 定时任务 | `/loop` |
| --- | --- | --- | --- |
| 在哪跑 | 云端 | 你的电脑 | 你的电脑 |
| 需要电脑开着 | 否 | 是 | 是 |
| 需要会话开着 | 否 | 否 | **是** |
| 重启后还在 | 是 | 是 | 恢复会话时恢复(有例外) |
| 能访问本地文件 | 否(全新克隆) | 是 | 是 |
| 最短间隔 | 1 小时 | 1 分钟 | 1 分钟 |

**要可靠地脱离你的电脑运行,用云端;需要本地文件和工具,用 Desktop;会话里临时盯一件事,用 `/loop`**。

### 3.2 `/loop` 的三种写法

| 写法 | 效果 |
| --- | --- |
| `/loop 5m 检查部署状态` | 固定每 5 分钟跑一次 |
| `/loop 检查 CI 是否通过,处理新的评审意见` | **Claude 自己决定间隔**:每轮结束后在 1 分钟到 1 小时之间选下一次,忙的时候短、安静了就长 |
| `/loop` | 跑内置的维护 prompt:继续未完成的工作 → 处理当前分支 PR 的评审意见、CI 失败、合并冲突 → 没事时做清理(找 bug、简化代码) |

prompt 也可以是一个 skill:`/loop 20m /review-pr 1234`。但只能是 Claude 自己能调用的 skill——带 `disable-model-invocation: true` 的、内置命令、MCP prompt 都不行。

内置维护 prompt 不会启动范围外的新工作,推送、删除这类不可逆操作只有在对话里已经授权过的前提下才会继续。想换成自己的默认 prompt,写 `.claude/loop.md`(项目)或 `~/.claude/loop.md`(个人):

```markdown
检查 `release/next` 的 PR。CI 红了就拉失败任务的日志、诊断、推一个最小修复。
有新的评审意见就逐条处理并解决讨论。一切正常就用一句话说明。
```

改了 `loop.md` 下一轮就生效。

### 3.3 停止

- **Claude 自定间隔的循环**:等待下一轮时按 `Esc`;任务完成时 Claude 也会自己结束它
- **固定间隔的循环**:`Esc` 和 `Ctrl+C` **停不掉**,要明确告诉 Claude"取消部署检查那个循环"

### 3.4 一次性提醒

```
下午 3 点提醒我推 release 分支
45 分钟后检查一下集成测试过了没
```

Claude 会安排一个只触发一次、触发后自动删除的任务。"我有哪些定时任务?"、"取消部署检查那个任务"——用自然语言管理即可,底层是 `CronCreate`、`CronList`、`CronDelete` 工具。

### 3.5 限制

- **只在 Claude Code 运行且空闲时触发**,关掉终端就停了
- **错过的不补**:Claude 忙着处理一个长请求时到点的任务,等它空闲后只触发一次
- **循环任务 7 天后自动过期**:最后触发一次然后自删,防止被遗忘的循环一直跑下去
- 恢复会话时会恢复未过期的任务,但后台命令和 monitor 不会重启

---

## 四、Monitor:盯着某件事,有变化就插话

和 `/loop` 的定时轮询不同,Monitor 工具让 Claude **在后台跑一个脚本,把每一行输出实时喂回来**:

- 跟踪日志文件,出现错误时立刻指出
- 轮询 PR 或 CI 任务,状态变化时报告
- 监视目录里的文件变化
- 连接一个 WebSocket,每来一条消息就报告

你在同一个会话里继续工作,事件到达时 Claude 会插话。每个监视都有截止时间:默认 5 分钟,最长 30 分钟(`-p` 单次运行里最长 10 分钟),到期后 Claude 会收到一次通知,需要的话可以重新开始。Monitor 跑的命令和 Bash 用同一套权限规则。

> 选择的思路:**事件能推送过来就用 channel,能流式读取就用 Monitor,只能定时去问就用 `/loop`**。

---

## 五、Deep links:从一个链接打开一个预填好的会话

```
claude-cli://open?repo=acme/payments&q=调查%20payments-api%20部署失败的原因
```

`claude-cli://` 是 Claude Code 向操作系统注册的 URL 协议,点击后在新的终端窗口里打开 Claude Code,**进入指定的仓库目录,输入框里预填好 prompt,但不会自动发送**——你看一眼、改一改,回车才开始。

适合放在:

- 故障处理手册的某一步:打开受影响服务的仓库,预填诊断 prompt
- 监控告警和仪表盘:链到针对某个指标的调查 prompt
- README 或 wiki:用一个入门 prompt 打开项目
- CI 失败通知:预填失败任务的名字

---

## 六、选型速查

| 需求 | 用什么 |
| --- | --- |
| 脚本或 CI 里跑一个任务 | `claude -p`,CI 里加 `--bare` |
| 需要结构化结果 | `--output-format json` + `--json-schema` |
| 没人能回答弹窗 | `--allowedTools` / `--permission-mode auto` + `--permission-prompts none` |
| CI 失败、聊天消息要推给开着的会话 | channels |
| 会话里盯着部署或 PR | `/loop` 或 Monitor |
| 每天早上固定跑,不依赖你的电脑 | 云端定时任务(19 篇) |
| 需要本地文件的定时任务 | Desktop 定时任务(20 篇) |
| PR 自动审查、issue 分诊 | GitHub Actions / Code Review(22 篇) |
| 一键打开预设好的任务 | deep link |

---

## 七、踩坑

1. **`-p` 里一堆调用被拒**——默认 Manual 且没人回答弹窗。用 `--allowedTools` 或 `--permission-mode auto`
2. **CI 里不加 `--bare`**——仓库里的 hooks 和 MCP server 会在未信任的目录里直接运行
3. **`--bare` 跑不起来**——它不用订阅登录,要设 `ANTHROPIC_API_KEY`
4. **脚本直接读 `structured_output`**——Claude 拒绝时没有这个字段,先检查
5. **管道喂进去几十 MB 的日志**——stdin 上限 10MB,写文件再引用路径
6. **按 `Esc` 想停掉 `/loop 5m`**——固定间隔的循环要让 Claude 取消
7. **关了终端以为 `/loop` 还在跑**——它只在会话开着且空闲时触发
8. **用 `/loop` 做长期定时任务**——7 天自动过期,长期任务用云端或 Desktop 定时任务
9. **channel 不设白名单就公开 bot**——任何人都能往你的会话里发指令
10. **deep link 以为会自动执行**——它只预填,不发送,这是有意的安全设计

---

下一篇:`19-云端会话与Routines.md`,讲 Claude Code on the web 的云端会话、云环境与自建运行环境、云端定时任务(routines)、从终端把任务甩到云端,以及 Projects。
