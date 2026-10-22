# 权限模式、auto mode 与沙箱

03 篇讲的权限规则回答"**哪些具体调用**放行或拦截"。这一篇讲另外两层:**权限模式**决定没有规则命中时的默认态度——问你、直接做、交给分类器判断,还是一律拒绝;**沙箱**决定一条命令就算被放行了,在操作系统层面最多能碰到什么。

> 一句话先记住:**权限模式管"问不问你",沙箱管"放行之后能碰到什么"**。前者防误操作,后者在出事时限制损失范围。两者相互独立,可以叠加使用。

---

## 一、六种权限模式

| 模式 | 不问你就能做的事 | 适合 |
| --- | --- | --- |
| **`default`(Manual)** | 只有读取 | 每一步都要亲自审、敏感工作 |
| **`acceptEdits`** | 读取、改文件、`mkdir` / `mv` / `cp` 这类常见文件命令 | 改完再统一看 diff |
| **`plan`** | 读取和探索(auto mode 可用时,分类器批准的命令也能跑) | 动手前先调研和出方案 |
| **`auto`** | 几乎所有事,后台分类器做安全检查 | 长任务、减少被打断 |
| **`dontAsk`** | 工作目录内的读取 + 预先放行的工具,其余一律拒绝 | 锁死权限的 CI 和脚本 |
| **`bypassPermissions`** | 所有事 | **只用于隔离的容器和虚拟机** |

`default` 在界面上叫 **Manual**,配置值仍然是 `default`,命令行也接受 `manual` 作为别名。

### 切换方式

- **会话中**:按 `Shift+Tab` 循环。从 auto 开始按,顺序是 manual → accept edits → plan → 回到 auto;启动时开启了 bypass 的话,它也会出现在循环里
- **启动时**:`claude --permission-mode plan`
- **从弹窗切**:Manual 或 acceptEdits 模式下遇到 Bash 授权弹窗,auto mode 可用时会多一个选项 **Yes, and switch to auto mode**
- **`dontAsk` 不在循环里**,只能用 `--permission-mode dontAsk` 指定

---

## 二、会话从哪个模式开始

优先级:`--permission-mode` 参数 > settings 里的 `permissions.defaultMode` > 内置默认值。

内置默认值取决于你怎么运行:

| 运行方式 | 默认模式 |
| --- | --- |
| 任何 settings 文件把 `disableAutoMode` 设成 `"disable"` | `default` |
| `claude -p` 或 Agent SDK | `default` |
| 终端交互会话、VS Code 扩展 | `auto`(v2.1.283 起所有计划和服务商) |

两个后果要知道:

1. **交互式会话现在默认就是 auto mode**。第一次以 auto 启动时会提示一次。如果你在 `~/.claude/settings.json` 里设过别的 `defaultMode`,会继续用你设的
2. **`claude -p` 和 SDK 默认是 Manual,但没有人能回答弹窗**,所以需要授权的调用会被直接拒绝。脚本里要么加 allow 规则,要么显式指定 auto:

```bash
# 方式一:精确放行
claude -p "跑测试并修复失败" --allowedTools "Bash(npm test)" "Read" "Edit"

# 方式二:交给分类器
claude -p "跑测试并修复失败" --permission-mode auto
```

另外,**`defaultMode` 设成 `auto` 或 `bypassPermissions` 只能写在用户层或 managed 层**,写在项目的 `.claude/settings.json` 里不生效——否则克隆一个仓库就可能被它切进免审批模式。

---

## 三、auto mode:分类器在拦什么

### 3.1 工作原理

auto mode 下,每个动作执行前会被**一个独立的分类器模型**审查。它拦三类东西:**超出你请求范围的升级动作、指向未知基础设施的动作、看起来是被读到的恶意内容驱动的动作**(也就是提示注入)。

分类器的信任边界默认很窄:**工作目录 + 会话开始时当前仓库已配置的 remote**。会话中途用 `git remote add` 加的 remote 不算,其他一切都被视为"外部"。

可用条件:所有计划都可用;Team / Enterprise 管理员可以关掉;模型方面,在 Anthropic API 上需要 Opus 4.6 / Sonnet 4.6 及以上、Haiku 5.5 或 Fable 系列。

> auto mode 减少的是弹窗,**不是风险**。适合你信任大方向的任务,不能替代对敏感操作的审查。

### 3.2 默认拦截的动作(节选)

- 下载并执行代码,比如 `curl | bash`
- 把敏感数据发到外部、把凭证打印进对话或文件
- 生产部署和迁移、`terraform destroy`、修改共享基础设施
- 强制推送;`git reset --hard`、`git clean -fd`、`git stash drop` 等会丢失未提交改动的命令
- 修改不是本会话创建的、或已经推送过的提交(`git commit --amend`)
- 授予 IAM 或仓库权限、改 DNS 或证书、写入密钥管理服务
- 合并没人批准过的 PR、批准自己的 PR、关掉 CI 检查
- 带 `--insecure` 这类关闭安全防护的参数
- 启动无人审批、无沙箱的自治 agent 循环
- 向公开仓库推送密钥或机密材料,向别的仓库或组织开 PR、fork
- 注释掉或强制通过保护安全行为的测试
- 访问云实例元数据端点(`169.254.169.254`)拿凭证、扫描同机的其他容器

完整列表用 `claude auto-mode defaults` 打印出来。

### 3.3 默认放行的动作

- 工作目录里的本地文件操作
- 安装锁文件或清单里声明过的依赖
- 读 `.env`,并把凭证发给与之匹配的 API
- 只读的 HTTP 请求
- **推送到当前仓库的任意分支,包括默认分支**(名字像部署目标的分支,如 `production`、`gh-pages`,会单独判断)
- 按你的请求创建 PR

注意最后两条:**auto mode 默认允许 push 到 main 和开 PR**。如果你需要在推送前人工过目,要自己加 ask 规则(见 3.5)。

### 3.4 对话里说的话会影响它

- **你说的边界会被当成拦截信号**。说了"别 push"、"等我审完再部署",匹配的动作会被拦下,即使默认规则允许
- **你说的批准要具体**。"你可以 force push"什么也不放行;要说清楚是哪个动作、哪个对象,比如"可以 force push `feature/x` 分支"。而且一次批准通常只覆盖那一个动作
- **但这些都不是规则**。分类器每次从对话记录里重新读取,一旦上下文压缩把那条消息压掉,边界就丢了。**必须守住的边界写成 deny 规则**

### 3.5 被拦之后

- 弹出通知,动作出现在 `/permissions` 的 **Recently denied** 标签页,按 `r` 可以手动批准重试
- **连续被拦 3 次或累计 20 次**,auto mode 暂停,恢复弹窗询问;你批准一次后恢复 auto
- `-p` 这类非交互运行没有弹窗可退:被拦的动作不执行,Claude 继续干别的,不会中止整个运行

频繁误拦通常说明分类器不了解你的基础设施,这时该配置 `autoMode`,而不是关掉 auto mode。

### 3.6 配置 autoMode

```json
{
  "autoMode": {
    "environment": [
      "$defaults",
      "Source control: github.example.com/acme-corp 下的所有仓库",
      "Trusted cloud buckets: s3://acme-build-artifacts",
      "Trusted internal domains: *.corp.example.com"
    ],
    "soft_deny": ["$defaults", "不要修改 migrations/ 目录下已经发布过的迁移文件"],
    "allow": ["$defaults"]
  },
  "permissions": {
    "ask": ["Bash(git push *)", "Bash(gh pr create *)"]
  }
}
```

- **`environment`** 是最常用的字段:告诉分类器哪些仓库、存储桶、域名是自家的。没列进去的目的地都可能被当成数据外泄
- **`hard_deny` / `soft_deny` / `allow`** 是用自然语言写的规则。`hard_deny` 无条件拦截;`soft_deny` 可以被 `allow` 例外或你的明确指令覆盖
- **`"$defaults"`** 表示保留内置规则并在这个位置插入你的规则,这样还能继承后续的内置更新
- 跑 `/auto-mode-setup` 可以让它读你的环境自动起草 `environment` 条目;改完跑 `claude auto-mode config` 确认生效的规则里包含了你的条目
- **`autoMode` 只从用户层、managed 层和 `--settings` 读取,不读项目文件**,原因同上:防止仓库自己给自己开后门
- 分类器也会读 CLAUDE.md,所以"永远不要 force push"这类项目约定写在 CLAUDE.md 里,对模型和分类器同时有效

三种边界机制对比:

| 边界 | 机制 | auto mode 下的行为 |
| --- | --- | --- |
| 执行前必须问我 | `permissions.ask` | 总是弹窗,分类器不能代批 |
| 永远不能执行 | `permissions.deny` | 在分类器之前就拦下,谁也覆盖不了 |
| 这次会话别做 | 在对话里说 | 分类器会拦,但可能随上下文压缩丢失 |

---

## 四、其余几种模式的细节

### 4.1 acceptEdits

自动放行工作目录(和附加目录)内的文件编辑,以及 `mkdir`、`touch`、`rm`、`rmdir`、`mv`、`cp`、`sed`。仍然会问的:范围外的路径、受保护路径、针对关键路径的 `rm`、其他所有不在只读集合里的 Bash 命令。

适合"让它放手改,我事后用 `git diff` 统一看"的工作方式。

### 4.2 plan

只调研、出方案,不改源码。auto mode 可用时,探索用的命令由分类器批准(`useAutoModeDuringPlan` 默认开);否则只读集合以外的命令都要问。也可以只对一条消息生效:消息前加 `/plan`。方案审批和后续流程见 08 篇。

### 4.3 dontAsk

**会弹窗的一律拒绝**,只有预先放行的工具和免授权的读取能跑。专为 CI 设计:

```bash
claude -p "run the test suite" --permission-mode dontAsk --allowedTools "Bash(npm test)" "Read"
```

### 4.4 bypassPermissions

跳过权限检查,工具调用立即执行,包括写受保护路径。几条硬限制:

- **只能在启动时开启**(`--permission-mode bypassPermissions` 或等价的 `--dangerously-skip-permissions`),不能在会话中途切进去
- 第一次开启会弹警告让你确认承担责任
- **在 Linux / macOS 上以 root 或 `sudo` 运行时拒绝启动**(识别出在沙箱里时除外)
- 云端会话忽略 settings 文件里的 `bypassPermissions` 和 `dontAsk`
- 它对提示注入**没有任何防护**。想要"弹窗很少但仍有安全检查",用 auto mode

管理员可以用 `permissions.disableBypassPermissionsMode` 和 `permissions.disableAutoMode` 在 managed settings 里禁用这两种模式。

---

## 五、任何模式都不会自动放行的东西

不管哪种模式,包括 `bypassPermissions`,下面这些都会停下来:

- 命中**显式 ask 规则**的调用
- 需要用户交互的工具:`AskUserQuestion`,以及被标记为 `requiresUserInteraction` 的 MCP 工具
- 针对**关键路径**的 `rm` / `rmdir`:文件系统根、家目录、工作目录等,任何 allow 规则和 hook 都批准不了
- 跨会话消息的安全保护(16 篇)

另有一组**受保护路径**,写入时除了 `bypassPermissions` 都不会自动放行,而且 **allow 规则不能预先批准**:

- 目录:`.git`、`.vscode`、`.idea`、`.husky`、`.devcontainer`、`.cargo`、`.yarn`、`.claude`(Claude 自己的 worktree、计划文件、auto memory 的 Markdown 等少数例外)
- 文件:`.gitconfig`、各种 shell 启动文件(`.bashrc`、`.zshrc`、`.profile`、`.envrc`……)、`.npmrc`、`.yarnrc`、`.pre-commit-config.yaml`、`.mcp.json`、`.claude.json` 等

这些文件的共同点是**改了之后会在下一次操作时自动执行代码**,所以单独保护。

---

## 六、沙箱:给 Bash 加一道操作系统级边界

### 6.1 它限制什么

沙箱由操作系统强制执行,包住 Claude 跑的 shell 命令(Bash、PowerShell、Monitor)及其所有子进程。默认关闭,用 `/sandbox` 开启,或在 settings 里设 `sandbox.enabled`。

| 访问 | 默认 | 用什么调整 |
| --- | --- | --- |
| 写 | 工作目录、一个用户专属临时目录、附加目录;受保护路径始终禁写 | `filesystem.allowWrite` |
| 读 | **机器上的大部分位置,包括 `~/.ssh`、`~/.aws/credentials`** | `filesystem.denyRead` |
| 网络 | 没有直连出口,所有连接走本机代理按允许域名检查,**允许列表初始为空** | `network.allowedDomains` |
| 环境变量 | 继承 Claude Code 的环境,包括里面的密钥 | 凭证保护配置 |

注意读权限的默认值:**沙箱默认防的是"写坏"和"偷偷联网",不防"读到"**。要保护凭证文件,自己加 `denyRead`。

支持平台:macOS、Linux、WSL2。**原生 Windows 上命令不经沙箱**,需要沙箱就在 WSL2 里跑 Claude Code。底层是开源的 `@anthropic-ai/sandbox-runtime`。

### 6.2 它不包什么

- **内置的文件和 Web 工具**:Read、Edit、WebFetch 等走权限规则,不受沙箱约束。`denyRead` 挡不住 Read 工具,`allowedDomains` 也限制不了 WebFetch
- **Claude Code 启动的其他进程**:hooks、本地 MCP server、LSP server、status line 命令
- **你自己在 `!` 前缀下输入的命令**:大多数会话里不进沙箱
- 匹配 `excludedCommands` 的命令,以及"非沙箱重试"

### 6.3 两种沙箱模式

| 模式 | 行为 |
| --- | --- |
| **Auto-allow** | 在沙箱里跑的命令**自动批准**,不弹窗;deny 规则、关键路径 `rm`、按内容写的 ask 规则依然生效 |
| **Regular permissions** | 即使在沙箱里,所有命令仍走正常的授权流程 |

Auto-allow 是"不想用分类器、又想少弹窗"时的另一条路:**Manual 模式 + 沙箱 auto-allow**,命令在边界内随便跑,越界才问你。

### 6.4 非沙箱重试与严格模式

有些工具和沙箱不兼容,命令在沙箱里失败后,Claude 可以申请**不经沙箱重跑**(工具参数 `dangerouslyDisableSandbox`)。谁来批准取决于模式:Manual / acceptEdits 弹窗,auto 交给分类器,dontAsk 直接拒绝,bypass 直接放行。

想彻底关掉这个逃生口:

```json
{
  "sandbox": {
    "enabled": true,
    "allowUnsandboxedCommands": false,
    "filesystem": {
      "allowWrite": ["/tmp/build"],
      "denyRead": ["~/.ssh", "~/.aws"]
    },
    "network": {
      "allowedDomains": ["registry.npmjs.org", "github.com", "*.example.com"]
    }
  }
}
```

或者保留重试但每次都问你:加一条 ask 规则 `Bash(dangerouslyDisableSandbox:true)`,这条规则在 auto 和 bypass 模式下同样会弹窗。

---

## 七、更外层的隔离

Bash 沙箱只包 shell 命令。想隔离得更彻底,有这些选择:

| 方式 | 隔离范围 | 需要 Docker | 成本 |
| --- | --- | --- | --- |
| **Bash 沙箱** | shell 命令及子进程 | 否 | macOS 几乎为零,Linux / WSL2 较低 |
| **sandbox runtime** | 整个 Claude Code 进程,包括文件工具、MCP、hooks | 否 | 低 |
| **dev container** | 完整开发环境 | 是 | 中 |
| **自定义容器** | 完整开发环境 | 是 | 中到高 |
| **虚拟机** | 完整操作系统 | 否 | 高 |
| **云端会话** | Anthropic 托管的完整系统 | 否 | 无,需要订阅 |

怎么选:

- **日常在自己机器上少弹窗** → Bash 沙箱
- **要用 `--dangerously-skip-permissions` 或长时间 auto mode 无人值守** → dev container、其他容器或虚拟机
- **连 MCP server 和 hooks 也要隔离,又不想装 Docker** → sandbox runtime
- **处理不信任的仓库** → 专用虚拟机,或云端会话
- **团队统一一套隔离环境** → 把官方 dev container 配置放进仓库

---

## 八、常见组合

| 你想要 | 怎么配 | 需要的隔离 |
| --- | --- | --- |
| 每一步都亲自审 | `--permission-mode default` | 无 |
| 少弹窗但不用分类器 | Manual + `/sandbox` 选 auto-allow | Bash 沙箱 |
| 先调研再动手 | `--permission-mode plan` | 无 |
| 放手干活 | auto(交互会话的默认) | 不强制,加沙箱更稳 |
| CI 里精确放行 | `-p` + `dontAsk` + `--allowedTools` | CI runner 本身 |
| 容器里完全无人值守 | `-p` + `--dangerously-skip-permissions`,非 root 用户 | **必须**:容器、虚拟机或 sandbox runtime |

---

## 九、踩坑

1. **以为 auto mode 会拦 push 到 main**——默认允许。需要人工过目就加 `ask: Bash(git push *)`
2. **在对话里说"别部署"就以为安全了**——上下文一压缩就可能丢。硬边界写 deny 规则
3. **`claude -p` 里一堆调用莫名被拒**——非交互默认是 Manual,没人回答弹窗。加 `--allowedTools` 或 `--permission-mode auto`
4. **把 `defaultMode: "auto"` 写进项目 settings**——不生效,写到用户层
5. **在宿主机上用 `--dangerously-skip-permissions`**——它对提示注入毫无防护。只在容器或虚拟机里用
6. **开了沙箱就以为凭证安全**——沙箱默认允许读 `~/.ssh`,要自己加 `denyRead`
7. **以为沙箱管得住所有工具**——它只包 shell 命令,Read / WebFetch / MCP / hooks 不在里面
8. **在原生 Windows 上开沙箱**——不支持,用 WSL2
9. **频繁误拦就关掉 auto mode**——更好的做法是配 `autoMode.environment`,让分类器认识你的基础设施
10. **以为 allow 规则能让 Claude 改 `.git` 或 `.bashrc`**——受保护路径不接受 allow 预批,每次都要确认

---

下一篇:`05-会话-上下文与检查点.md`,讲会话的恢复与分叉、上下文窗口里装了什么、自动压缩的规则,以及怎么用检查点回退。
