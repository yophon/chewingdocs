# 安装、登录与 settings

装 Claude Code 只要一行命令,但"装好"和"配好"是两回事。真正决定日常体验的是三件事:**装的是哪个发行渠道、用的是哪个凭证、每个配置项写在了哪一层**。这三件事搞错,后面就会出现"队友拿不到我的配置"、"明明有订阅却在扣 API 费"、"改了配置不生效"这类问题。

> 一句话先记住:**settings 的本质不是"值是多少",而是"这个值对谁生效"**。写在用户层只对你自己生效,写在项目层对整个团队生效,写在 managed 层对整个组织生效。放错层,要么队友拿不到,要么把个人偏好强加给了团队。

---

## 一、安装

### 1.1 几种安装方式

| 方式 | 命令 | 自动更新 |
| --- | --- | --- |
| **原生安装(推荐)** | macOS / Linux / WSL:`curl -fsSL https://claude.ai/install.sh \| bash`<br>Windows PowerShell:`irm https://claude.ai/install.ps1 \| iex` | 后台自动更新 |
| **Homebrew** | `brew install --cask claude-code` | 默认不自动 |
| **WinGet** | `winget install Anthropic.ClaudeCode` | 默认不自动 |
| **apt / dnf / apk** | 按官方仓库配置 | 需手动升级 |
| **npm** | `npm install -g @anthropic-ai/claude-code` | 能自动更新(全局目录可写时) |

几个容易误会的点:

- **现在发行的是原生二进制**,不再是打包的 JavaScript。npm 方式装的也是同一个原生二进制(通过平台相关的可选依赖拉下来),`claude` 运行时并不依赖 Node;npm 包本身要求 Node.js 22+
- **不要 `sudo npm install -g`**,会带来权限问题和安全风险
- Homebrew 有两个 cask:`claude-code` 跟 stable 通道(大约晚一周,跳过有严重回归的版本),`claude-code@latest` 跟最新通道
- 装完开一个新终端跑 `claude --version`。提示找不到命令,就是安装目录还没进 PATH

系统要求:macOS 13+、Windows 10 1809+、Ubuntu 20.04+、Debian 10+、Alpine 3.19+,4GB 以上内存。

### 1.2 Windows:原生还是 WSL

| 方式 | 依赖 | 沙箱 | 适合 |
| --- | --- | --- | --- |
| **原生 Windows** | 无;Git for Windows 可选 | 不支持 | Windows 原生项目和工具链 |
| **WSL 2** | 开启 WSL 2 | 支持 | Linux 工具链、需要沙箱执行命令 |
| **WSL 1** | 开启 WSL 1 | 不支持 | WSL 2 不可用时 |

原生 Windows 已经**不再强制要求 Git Bash**:

- **没装 Git for Windows**:Claude Code 用 PowerShell 工具执行 shell 命令
- **装了 Git for Windows**:Bash 工具走 Git Bash,PowerShell 工具同时可用。找不到 Git Bash 时在 settings 的 `env` 里设 `CLAUDE_CODE_GIT_BASH_PATH`

> 选择标准很简单:**项目是 Linux 工具链、或者你需要 04 篇讲的命令沙箱,就用 WSL 2;纯 Windows 项目用原生**。

---

## 二、更新与发布通道

原生安装会在启动时和运行中检查更新,后台下载,**下次启动生效**。可以控制它跟哪个通道:

```json
{
  "autoUpdatesChannel": "stable",
  "minimumVersion": "2.1.250"
}
```

- `autoUpdatesChannel`:`"latest"`(默认,新功能第一时间到)或 `"stable"`(大约一周前的版本,跳过有严重回归的)
- `minimumVersion`:版本下限。从 latest 切到 stable 时不会因此降级
- 新发布的模型可能要求比 stable 通道更新的版本,想第一时间用新模型就留在 latest

关更新的两个开关别搞混:

| 环境变量 | 效果 |
| --- | --- |
| `DISABLE_AUTOUPDATER=1` | 只关后台自动检查,`claude update` 仍然能用 |
| `DISABLE_UPDATES=1` | 所有更新路径都关掉,包括手动。适合企业自己分发固定版本 |

手动更新跑 `claude update`。想知道上次自动更新成没成功,在 shell 里跑 `claude doctor`。

---

## 三、登录:账号类型与凭证优先级

### 3.1 能用哪些账号登录

第一次运行 `claude` 会打开浏览器登录。支持的账号类型:

| 账号 | 计费方式 | 适合 |
| --- | --- | --- |
| **Claude Pro / Max** | 订阅额度 | 个人 |
| **Claude Team / Enterprise** | 组织订阅 | 团队,管理员邀请 |
| **Claude Console** | 按 API 用量 | 按量付费、需要 API 计费的团队 |
| **云厂商**(Amazon Bedrock、Google Cloud、Microsoft Foundry) | 走云账单 | 已有云厂商合同的企业 |
| **Claude apps gateway** | 组织自建网关 | 需要统一出口和 SSO 的企业 |

几个实用技巧:

- 浏览器没自动打开:按 `c` 复制登录链接
- **WSL2、SSH、容器里**浏览器回调不到本地端口:登录页会显示一串代码,粘贴到终端的 `Paste code here if prompted` 提示处
- 想在 shell 里先登录再开会话:`claude auth login`
- 同时登录工作和个人两个账号:给每个账号一个配置目录

```bash
alias claude-work='CLAUDE_CONFIG_DIR=~/.claude-work claude'
```

每个目录有独立的 settings、会话和凭证。

### 3.2 凭证优先级:为什么"有订阅却在扣 API 费"

机器上有多个凭证时,Claude Code 按这个顺序选第一个:

```
1. 云厂商凭证        设了 CLAUDE_CODE_USE_BEDROCK / _VERTEX / _FOUNDRY
2. ANTHROPIC_AUTH_TOKEN   以 Bearer 头发送,常用于 LLM 网关
3. ANTHROPIC_API_KEY      以 X-Api-Key 发送,交互模式下会先问你是否使用
4. apiKeyHelper           settings 里配置的脚本输出,适合轮换凭证
5. CLAUDE_CODE_OAUTH_TOKEN  claude setup-token 生成的长期令牌
6. Anthropic profile / 联邦凭证  ant CLI 和工作负载身份联邦用的
7. /login 的订阅登录       Pro / Max / Team / Enterprise 的默认方式
```

**最常见的坑**:你有 Max 订阅,但 shell 里还留着一个 `ANTHROPIC_API_KEY`。一旦你在提示里同意使用它,就开始按 API 计费;如果这个 key 属于已停用的组织,还会直接认证失败。解决办法是 `unset ANTHROPIC_API_KEY`,然后跑 `/status` 确认当前用的是哪种凭证。

### 3.3 CI 和脚本里怎么认证

没法开浏览器的环境,用 `claude setup-token` 生成一个一年有效的 OAuth 令牌:

```bash
claude setup-token
# 浏览器里授权后,令牌打印在终端,它不会替你保存
export CLAUDE_CODE_OAUTH_TOKEN=你的令牌
```

或者直接用 Console 的 API key(`ANTHROPIC_API_KEY`)。**云端会话永远用你的订阅凭证**,在云环境里设 API key 不会覆盖它。

### 3.4 凭证存在哪

| 系统 | 位置 |
| --- | --- |
| macOS | 系统钥匙串(钥匙串锁着时退回 `~/.claude/.credentials.json`) |
| Linux | `~/.claude/.credentials.json`,权限 `0600` |
| Windows | `%USERPROFILE%\.claude\.credentials.json` |

登录快过期(剩三天)时启动会提示,跑 `/login` 续期。**长时间无人值守的会话要提前续**,凭证过期后它就停在那里不动了。

---

## 四、settings 的四层作用域

### 4.1 四个文件

| 作用域 | 文件 | 对谁生效 | 写什么 |
| --- | --- | --- | --- |
| **用户** | `~/.claude/settings.json` | 你,在这台机器的所有项目 | 个人偏好:主题、编辑模式、默认模型、个人权限规则 |
| **项目共享** | `.claude/settings.json` | 这个目录里工作的所有人,提交到 git 后队友也拿得到 | 团队的权限、hooks、插件、项目需要的环境变量 |
| **项目本地** | `.claude/settings.local.json` | 只有你,只在这个项目 | 对团队配置的个人覆盖、分享前的试验 |
| **Managed** | `managed-settings.json`、MDM 策略、claude.ai 后台下发 | 组织部署到的所有人 | 安全策略和合规要求 |

另外还有一个 `~/.claude.json`,是 Claude Code **自己写给自己的**:账号信息、MCP server 配置、每个项目的信任决定等。一般不用手动改。

### 4.2 几个关键细节

- **`settings.local.json` 会自动被 git 忽略**。Claude Code 第一次写这个文件时,会把 `**/.claude/settings.local.json` 加进你的全局 git 排除文件。你手动创建的话要自己加 `.gitignore`
- **你点"Yes, and don't ask again"时,权限会被写进 `settings.local.json`**,不是项目共享文件。所以你批准过的命令不会悄悄变成团队规则
- **项目共享文件里有些配置要等"信任"**。`permissions.allow`、`additionalDirectories`、插件市场、大部分 `env` 值,要等每个队友在自己机器上信任这个目录后才生效。这是防止"克隆一个恶意仓库就被放行了危险命令"
- **有些 key 根本不能写在项目文件里**。比如把默认权限模式设成 `auto` 或 `bypassPermissions`,只能在用户或 managed 层设;遥测导出相关的环境变量也一样。查 settings 参考里每个 key 的 Scope 列

---

## 五、优先级:同一个 key 写在多处时听谁的

从高到低:

```
1. Managed settings      组织下发,谁都覆盖不了
2. 命令行 --settings      只对这一次会话生效
3. 项目本地 settings.local.json
4. 项目共享 settings.json
5. 用户 ~/.claude/settings.json
```

三条规则要记住:

1. **标量取最高层**。团队设了 `spinnerTipsEnabled: true`,你在用户层设 `false` 没用;要在 `settings.local.json` 里覆盖
2. **列表会合并,不会覆盖**。`permissions.allow` 这类数组,每一层的条目都会叠加。少数几个模型相关的 key(比如有顺序含义的 `fallbackModel`)例外,整体取最高层的值
3. **环境变量不是一个"层"**,每个变量和 key 的关系单独规定。比如 shell 里的 `ANTHROPIC_MODEL` 会覆盖任何文件里的 `model`,`--model` 又覆盖两者

> 另外,有几个安全相关的 key 反过来:**低层的更严格值会胜过 managed 的宽松值**。安全规则只能收紧,不能被放宽。

---

## 六、改配置的三种方式

### 6.1 `/config` 菜单

会话里跑 `/config`,改主题、编辑模式、verbose 这类个人选项,它会帮你写进对应文件。也能直接写 `/config verbose=true`。

### 6.2 直接编辑文件

settings 是**严格 JSON**:不能有 `//` 注释,不能有尾逗号。加上 `$schema` 能让编辑器补全和校验:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Bash(npm run lint)", "Bash(npm run test *)"]
  }
}
```

**大部分修改会热加载**,包括 `permissions`、`hooks`、`apiKeyHelper`,不用重启。例外是 `model` 和 effort 只在会话开始时读,会话中途要用 `/model`、`/effort` 切。

### 6.3 只改这一次会话

```bash
# 这次会话用 Opus,不改默认值
claude --settings '{"model": "opus"}'

# 或者用对应的 flag
claude --model opus --effort high
```

`--settings` 可以传 JSON 字符串,也可以传文件路径。

---

## 七、起手配置

### 7.1 个人 `~/.claude/settings.json`

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "opus",
  "editorMode": "vim",
  "language": "chinese",
  "spinnerTipsEnabled": false,
  "preferredNotifChannel": "terminal_bell",
  "statusLine": {
    "type": "command",
    "command": "jq -r '\"[\\(.model.display_name)] \\(.context_window.used_percentage // 0)% context\"'"
  },
  "permissions": {
    "allow": ["Bash(git diff *)", "Bash(git status)"]
  },
  "cleanupPeriodDays": 30
}
```

- `model` 用别名(`opus`、`sonnet`、`haiku`、`fable`),别名会随新版本自动指向推荐模型;要钉死版本就写完整 ID
- `language` 让 Claude 用中文回复
- `cleanupPeriodDays` 控制本地会话记录保留多少天

### 7.2 团队 `.claude/settings.json`

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Bash(npm run *)"],
    "ask": ["Bash(git push *)"],
    "deny": ["Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)"]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh" }
        ]
      }
    ]
  },
  "extraKnownMarketplaces": {
    "acme-tools": {
      "source": { "source": "github", "repo": "acme-corp/claude-plugins" }
    }
  },
  "enabledPlugins": { "code-formatter@acme-tools": true }
}
```

团队文件只放**所有人都该有的东西**:权限底线、强制执行的 hooks、团队插件。个人口味(模型、主题、编辑模式)一律不进这个文件。

> 想控制 Claude 在提交信息里加的署名行,用 `attribution`;想去掉内置的提交和 PR 指令,把 `includeGitInstructions` 设成 `false`。

---

## 八、配置不生效怎么排查

按这个顺序查:

1. **`/status`**:看 `Setting sources` 行,确认加载了哪些 settings 文件、当前用的是哪种凭证、有没有 managed 策略
2. **`claude doctor`**(shell 里跑)或会话里的 `/doctor`:列出被拒绝的配置项和原因,还能检查安装、更新状态
3. **看启动时的提示**:JSON 写错会弹 Settings Error;只有个别条目非法会弹 Settings Warning,其余照常生效
4. **安全模式**:`claude --safe-mode` 关掉 CLAUDE.md、skills、插件、hooks、MCP、自定义命令和子代理、自定义 output style 和快捷键,只保留认证、模型、内置工具和权限。问题消失了,就说明是某个定制引起的
5. **干净配置测试**:

```bash
mkdir -p ~/claude-clean/empty && cd ~/claude-clean/empty
CLAUDE_CONFIG_DIR=~/claude-clean/config claude --setting-sources user
```

在空目录、全新配置目录下复现。还能复现,问题就不在你的配置里。

---

## 九、踩坑

1. **把个人偏好写进项目共享文件**——你喜欢 vim 模式不代表队友喜欢。个人的东西放用户层或 `settings.local.json`
2. **settings 里写了注释**——严格 JSON,`//` 直接导致整个文件被跳过
3. **shell 里残留 `ANTHROPIC_API_KEY`**——订阅白买,账单照扣。用 `/status` 确认凭证来源
4. **以为项目文件里的 allow 规则马上生效**——要等每个人信任目录;没信任前他们依然会被询问
5. **把 `defaultMode: "auto"` 写进项目文件**——不会生效,这个值只能在用户或 managed 层设
6. **改了 `model` 等着生效**——会话中途改文件不会切模型,用 `/model`
7. **WSL / SSH 里登录卡住**——不是坏了,是浏览器回调不到;用登录页给的代码粘回终端
8. **Homebrew / WinGet 装完就不管了**——它们默认不自动更新,几个月后版本落后很多。设 `CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE=1` 或定期手动升级
9. **用 `sudo npm install -g`**——权限错乱的源头。用原生安装器
10. **无人值守会话不管登录有效期**——凭证一过期,后台会话就停在原地

---

下一篇:`03-工具与权限规则.md`,讲内置工具清单和各自的隐含规则,以及 allow / ask / deny 规则的写法和匹配方式。
