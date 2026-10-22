# Desktop、Remote Control 与移动端

终端是 Claude Code 功能最全的界面,但不是唯一的界面。**Desktop App** 提供可视化的 diff 审阅、并排的多会话、内置浏览器和 iOS 模拟器;**Remote Control** 让你在手机或浏览器上接着操控电脑上正在跑的本地会话;**Claude App** 的 Code 标签页可以发起云端任务、盯进度;Slack 里 @Claude 能直接把讨论变成 PR。

> 一句话先记住:**换界面不换内核**。Desktop、手机、浏览器、Slack 背后跑的都是同一个 Claude Code,本地的 CLAUDE.md、settings、MCP 配置在本地几个界面之间共享。区别只在于"代码在哪跑"(本地还是云端)和"你从哪看"。

---

## 一、Desktop App 的 Code 标签页

### 1.1 是什么

Claude Desktop App 里的 **Code** 标签页就是 Claude Code。App 里还有聊天和 Cowork(处理 Dispatch 和更长的 agent 工作)。macOS(Intel 和 Apple Silicon)、Windows(x64 和 ARM64)可用,Linux(Ubuntu / Debian)公测中。**App 自带 Claude Code,不需要另装 CLI**,需要付费订阅。

每个对话是一个**会话**,有自己的对话历史和项目目录。会话可以跑在三个地方:

| 位置 | 说明 |
| --- | --- |
| **Local** | 你的电脑 |
| **Cloud** | 云端(19 篇) |
| **SSH** | 一台远程机器,Desktop 只是界面,适合代码在云主机、开发容器或特殊硬件上的情况 |

### 1.2 并行会话

- `Cmd+N` / `Ctrl+N` 新建会话,`Ctrl+Tab` 在会话之间切换
- 按住 `Option` / `Alt` 点会话:**分屏**并排显示;按住 `Cmd` / `Ctrl` 点:在**新窗口**打开
- 新建会话前打开 **Worktree**,会话就在自己的 git worktree 里运行;可以设 worktree 存放位置和分支前缀
- `.worktreeinclude` 同样生效

### 1.3 审改动

- **diff 视图**:点 Changes 卡片里的 `+12 -1` 打开,逐文件看改动。**点击任意一行可以写评论**,写完多处后 `Cmd+Enter` / `Ctrl+Enter` 一次性提交,Claude 按评论修改,再出一版新 diff
- **`/code-review`**:审查结果以卡片形式按文件分组,可以在 diff 里逐条走查,单条"Fix this one",或"Apply fixes"一次修完
- **PR 状态**:开 PR 后显示在 Changes 卡片里,可以打开 **Auto-fix**(自动处理 CI 失败和评审意见)或 **Merge when ready**(开启 GitHub 的自动合并)。需要本机装好并登录 `gh`

### 1.4 预览和浏览器

- **应用预览**:Claude 可以启动 dev server,在 Browser 面板里打开,自己截图、检查 DOM、点按钮、填表单来验证改动。后端服务也行:测接口、看日志。自定义启动命令写在 `.claude/launch.json`
- **浏览外部网站**:Browser 面板是一个带标签页的浏览器,`Cmd+Shift+B` / `Ctrl+Shift+B` 打开。Claude 对外部页面的写操作(点击、输入)在任何模式下都会经过安全分类器;第一次在某个网站上操作会请你批准;**不会替你购物、注册账号、绕过验证码**
- 内置浏览器是**干净的独立配置**,没有你的登录态。需要用你已登录的账号操作网站,用 Chrome 扩展(21 篇)
- **iOS 模拟器面板**(macOS):Claude 构建、启动或检查你的 iOS 应用时,模拟器面板在对话旁边打开

### 1.5 工作区布局

聊天、diff、浏览器、终端、文件编辑器都是可以拖拽排列的面板,面板还能弹出成独立窗口。另外还有:旁支提问(不打断主会话)、后台任务面板、会话结束通知、让 Claude 查看或给你的其他会话发消息。

### 1.6 Computer use

让 Claude **打开你的应用、控制你的屏幕**,处理没有命令行接口、只能通过图形界面完成的事。研究预览,macOS 和 Windows,Pro / Max 计划,默认关闭,需要在设置里开启(macOS 还要授予辅助功能和屏幕录制权限)。macOS 上它可以在后台运行,你同时继续干自己的事。

Claude 会优先用最精确的工具,computer use 是最后的选择:

```
有 connector 就用 connector
  → shell 命令用 Bash
  → 浏览器任务用 Chrome 扩展
  → iOS 应用用模拟器面板
  → 都不行才用 computer use
```

按应用分级授权:浏览器最多只能"看",终端和 IDE 最多只能"点",把 Claude 引向专门的工具。

> computer use 运行在你**真实的桌面**上,能碰到你批准的一切,不像沙箱里的 Bash。Claude 会检查每个动作、标记屏幕内容里可能的提示注入,但它不是隔离环境。

### 1.7 Desktop 定时任务

Desktop 的 **Scheduled tasks** 页同时列出本地和云端两种定时任务:

| | 本地任务 | 云端任务 |
| --- | --- | --- |
| 在哪跑 | 你的电脑,能访问本地文件和工具 | 云端 |
| 触发条件 | **App 开着、电脑醒着** | 电脑关着也能跑,还能由 API 或 GitHub 事件触发 |

适合每天早上的代码审查、依赖更新检查、晨间简报这类需要本地环境的周期任务。

### 1.8 和 CLI 的差别

| | CLI | Desktop |
| --- | --- | --- |
| 权限模式 | 全部,包括 `dontAsk` | Manual、Accept edits、Plan、Auto(Bypass 需开启) |
| 第三方云 | Bedrock、Google Cloud、Foundry | 默认 Anthropic API |
| MCP | settings 文件 | Connectors 界面或 settings 文件 |
| 插件 | `/plugin` | 插件管理界面 |
| 附件 | 不支持 | 图片、PDF |
| 多会话 | 多个终端 | 侧栏标签页 |
| 定时任务 | cron、CI | Scheduled tasks |
| Computer use | macOS,通过 `/mcp` 开启 | macOS 和 Windows |
| **脚本和自动化** | `-p`、Agent SDK | **不支持** |

两者读同一套 settings 文件,在 Desktop 里也能继续一个终端里开的会话。

---

## 二、Remote Control:人走了,会话还在你的电脑上

### 2.1 和云端会话的区别

| | Remote Control | 云端会话 |
| --- | --- | --- |
| 代码在哪跑 | **你的电脑** | 云端虚拟机 |
| 能用本地文件、工具、MCP | 能 | 不能(全新克隆) |
| 需要电脑开着 | 需要 | 不需要 |
| 适合 | 任务需要本机环境,但你人不在电脑前 | 派出去不用管的任务 |

网页和手机只是一扇窗户,执行和文件都留在本地。

### 2.2 三种启动方式

```bash
claude remote-control                # 服务器模式:从网页或手机上新建和管理多个会话
claude --remote-control "My Project" # 交互式会话,同时可以在手机上操控(简写 --rc)
```

已经开着的会话里输入 `/remote-control`(`/rc`),**带着当前对话历史**接入。Desktop 和 VS Code 扩展里也用 `/remote-control`。

服务器模式的几个参数:`--spawn worktree` 让每个会话在自己的 worktree 里(默认 `same-dir` 共用目录,编辑同一批文件时可能冲突)、`--capacity` 最大并发会话数(默认 32)、`--permission-mode` 设置这些会话的起始权限模式。

### 2.3 能做什么

- 用你完整的本地环境:文件系统、MCP server、工具、项目配置;输入 `@` 补全本地项目的文件路径
- **多端同步**:对话、子代理和 workflow 的进度在所有连接的设备上同步,终端、浏览器、手机都能发消息
- 从手机发图片和文件给会话
- 笔记本休眠或断网后,机器恢复时自动重连
- **手机推送通知**:Claude 需要你的时候推送到手机

### 2.4 要求和限制

- Pro、Max、Team、Enterprise,**不支持 API key**,要用 claude.ai 账号 `/login`;Team / Enterprise 需要 Owner 先在管理后台打开
- Bedrock、Google Cloud、Foundry、指向其他主机的 `ANTHROPIC_BASE_URL`、Claude apps gateway 下都不可用
- 第一次使用需要确认一次
- **登录过期后会话就停住了**:长时间远程使用前先确认登录有效期(02 篇)

---

## 三、手机上的 Claude Code

**Claude Code 没有单独的手机 App**,它在 Claude App(iOS / Android)的 **Code** 标签页里。用和 Claude Code 相同的 claude.ai 账号登录。会话里跑 `/mobile`(或 `/ios`、`/android`)会显示一个二维码,直接打开对应的应用商店。

在手机上可以:

- **发起和盯云端会话**:提需求、看进度、回答它的问题
- **通过 Remote Control 操控电脑上的本地会话**
- **Dispatch**:在 App 里给 Dispatch 发一个任务,它判断是开发工作时会在你电脑的 Desktop 上开一个 Code 会话(Pro / Max,需要和 Desktop 配对)

| 你在外面,想…… | 用 |
| --- | --- |
| 发一个不依赖本机的任务 | 云端会话 |
| 接着管电脑上正在跑的会话 | Remote Control |
| 让电脑上开一个新任务 | Dispatch |
| 从终端开始、在手机上继续 | `claude --cloud`,再在手机上打开 |

---

## 四、Slack 与 Claude Tag

在 Slack 频道里 `@Claude` 一个编码任务,它会识别意图、创建一个云端会话去做,做完把 PR 链接回帖子里。适合:报 bug 的帖子直接变成修复、团队讨论里的上下文直接用于调试、在 Slack 里派活然后继续干别的。

两个版本:

| | Claude Code in Slack(早期版本) | Claude Tag |
| --- | --- | --- |
| 身份 | 每个会话用**个人**账号 | 组织共享的 `@Claude` 身份,管理员配置权限 |
| 计划 | Pro、Max | Team、Enterprise |
| 前提 | 工作区没有接入 Claude Tag;开启了云端会话;连接了 GitHub | 管理员设置 |

Team / Enterprise 的新工作区应该用 Claude Tag。

---

## 五、离开电脑时的选择总览

| 方式 | 怎么触发 | Claude 在哪跑 | 适合 |
| --- | --- | --- | --- |
| Dispatch | 在手机 App 里发任务 | 你的电脑(Desktop) | 人不在,把活派到自己电脑上 |
| Remote Control | 从网页或手机操控 | 你的电脑 | 接着管进行中的本地会话 |
| Channels(18 篇) | Telegram / Discord 等推送 | 你的电脑(CLI) | 对外部事件做反应 |
| Slack | 在频道里 @Claude | 云端 | 从团队讨论里派活 |
| 云端会话 | 浏览器、手机、`--cloud` | 云端 | 不依赖本机的长任务 |
| 自建运行环境 | 选择组织的环境 | 组织的基础设施 | 代码不能出内网 |
| 定时任务 | 设定时间 | CLI / Desktop / 云端 | 周期性自动化 |

---

## 六、踩坑

1. **用 Desktop 写脚本化流程**——Desktop 不支持 `-p` 和 Agent SDK,自动化用 CLI
2. **内置浏览器里找不到登录态**——它是干净的独立配置,需要账号身份的操作用 Chrome 扩展
3. **Desktop 本地定时任务指望电脑睡着时也跑**——App 开着、电脑醒着才触发,需要的话用云端任务
4. **以为 computer use 是沙箱**——它在你真实的桌面上操作
5. **分不清 Remote Control 和云端会话**——前者代码在你电脑上跑,电脑得开着
6. **用 API key 登录然后找不到 Remote Control**——它只支持 claude.ai 账号
7. **服务器模式默认 `same-dir`,几个会话改同一批文件**——用 `--spawn worktree`
8. **远程用了一整天,登录过期会话停了**——无人值守前先续期
9. **Team 计划还在用个人版 Slack 集成**——新工作区用 Claude Tag
10. **在 SSH 会话里点 Create PR 却没在远程机器装 `gh`**——推送和开 PR 都在远程机器上执行

---

下一篇:`21-Chrome-Computer-Use与Artifacts.md`,讲 Claude in Chrome 用你的浏览器测试和自动化网页、CLI 里的 computer use,以及用 artifacts 把会话产出发布成可交互的网页。
