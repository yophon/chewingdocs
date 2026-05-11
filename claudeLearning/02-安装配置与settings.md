# 安装配置与 settings.json 三层结构

Claude Code 的所有行为都是 `settings.json` 决定的——能跑哪些工具、能进哪些目录、什么模型、要不要钩子、状态栏长什么样,全在这里。理解三层 settings 的优先级关系,**比记住所有可配置项更重要**。

> 一句话先记住:**settings 三层 = 个人偏好(user)+ 团队共享(project)+ 当前机器临时(local)**。三层叠加生效,后面覆盖前面;搞错层级,你在团队里写的 hook 同事跑不了,或者同事的 hook 你这儿莫名其妙生效。

---

## 一、安装

```bash
# 推荐
npm install -g @anthropic-ai/claude-code

# 或者用 npx 试用
npx @anthropic-ai/claude-code
```

跑一下:

```bash
claude
```

第一次跑会让你登录(浏览器跳 Anthropic 账号、或手动贴 API key)。**别用 root 装**——npm global 走 nvm / pnpm / bun 都行,生产环境别 sudo。

```bash
# 看版本和登录状态
claude --version
claude /status

# 升级
claude /update      # 走自带通道
npm i -g @anthropic-ai/claude-code  # 或 npm 强升
```

> 团队第一次推 Claude Code,**统一 npm 版本**;不同版本的 settings schema 偶有差异,版本对不上时 hook 之类的能不能跑都说不准。

---

## 二、三层 settings 的关系

```
优先级(后面覆盖前面)
   ┌─────────────────────────────────────┐
   │ 1. enterprise(企业管理,可选)        │  公司 IT 推送的强制策略
   │ 2. user                             │  ~/.claude/settings.json
   │ 3. project                          │  .claude/settings.json (提交进 git)
   │ 4. local(项目本机)                  │  .claude/settings.local.json
   │ 5. 命令行 flag                       │  --model / --permission-mode
   └─────────────────────────────────────┘
```

每一层的**用法定位**:

| 层 | 路径 | 谁看见 | 适合放什么 |
| --- | --- | --- | --- |
| **enterprise** | `/etc/claude-code/managed-settings.json`(macOS:`/Library/Application Support/ClaudeCode/...`) | 你和所有同事 | 公司合规策略(禁用某些工具、强制 API endpoint) |
| **user** | `~/.claude/settings.json` | 只有你 | 个人偏好(默认模型、status line、个人快捷 slash) |
| **project** | `.claude/settings.json` | 团队所有人(提交 git) | 团队共享 hook、本项目要装的 MCP、统一权限 |
| **local** | `.claude/settings.local.json` | 只有你这台机器(在 .gitignore) | 个人 token、调试中的 hook、本机临时实验 |

**这套关系决定了"谁该写哪个文件"**——下面一段是核心。

---

## 三、各种配置该写在哪一层(决策表)

| 想配的事 | 写在哪 | 为什么 |
| --- | --- | --- |
| `model: claude-opus-4-7` 默认模型 | **user** | 个人偏好,别人不一定跟你一样 |
| `statusLine` 状态栏 | **user** | 个人审美,不该污染同事 |
| 团队约定的"提交前必须跑 lint" hook | **project** | 全队都该有,提交进 git |
| 项目用到的 MCP server(GitHub、Postgres) | **project**(`.mcp.json`) | 全队都要,新人 clone 即用 |
| 你个人的 GitHub token | **local** 的 `env` | 不能进 git |
| 临时关掉某个烦的 hook | **local** | 改完不会污染团队 |
| "禁止 rm -rf" 这种全局红线 | **enterprise** | 公司合规,不允许个人覆盖 |
| 当前 session 想用 sonnet | 命令行 `--model` flag | 一次性,不写文件 |

**最常见的错放**:

1. **把 GitHub token 写进 project settings** → push 出去就泄漏了
2. **把个人 hook 写进 project settings** → 同事 pull 下来发现自己的电脑跑了一段你写的脚本
3. **把团队规范写进 user settings** → 新人来了发现少了一堆约定行为

> 写之前问自己一句:**这条规则别人也要吗?会不会泄漏?改了之后我希不希望团队跟着改?** 三个问题答完,层级就定了。

---

## 四、settings.json 核心字段速查

下面列最常用的。完整字段以官方文档为准,这里只讲日常会动的。

```json
{
  "model": "claude-opus-4-7",
  "env": {
    "ANTHROPIC_API_KEY": "...",
    "BASH_DEFAULT_TIMEOUT_MS": "120000"
  },
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": ["Bash(npm test:*)", "Bash(git status)", "Read(./**)"],
    "deny": ["Bash(rm -rf*)", "Read(./.env*)"],
    "ask": ["Bash(git push:*)"],
    "additionalDirectories": ["/tmp/scratch"]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "scripts/audit.sh" }]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "scripts/statusline.sh"
  },
  "outputStyle": "default",
  "includeCoAuthoredBy": true,
  "cleanupPeriodDays": 30,
  "enabledMcpjsonServers": ["github", "postgres"],
  "enableAllProjectMcpServers": false,
  "apiKeyHelper": "scripts/get-api-key.sh"
}
```

### 4.1 `model`

主对话用什么模型。**user 层设默认**,具体任务要换在命令行 `--model` 或 `/model` slash 里。

| 模型 | 适合 | 一句话 |
| --- | --- | --- |
| `claude-opus-4-7` | 难任务、长任务、架构决策 | 最强,贵 |
| `claude-sonnet-4-5` / `claude-sonnet-4-7` | 日常 90% 的活 | 性价比之王 |
| `claude-haiku-4-5` | 简单批量任务、命令调度 | 最便宜最快 |

> 别一直无脑 Opus。**简单 CRUD、跑测试、看日志,Sonnet 完全够**;省下来的钱在真正难的任务上多 token,效果更好。

### 4.2 `env`

注入到 Claude Code 子进程的环境变量。常见用法:

- `ANTHROPIC_API_KEY` —— 但更推荐用 `apiKeyHelper`
- `BASH_DEFAULT_TIMEOUT_MS` —— bash 命令默认超时
- 给 hook / MCP server 用的业务变量

**env 在三层都能写,后面覆盖前面**——本机临时调试 token 写 local,稳定的写 user/project。

### 4.3 `permissions`

最关键的一块。**详见下一篇**,这里只说总体结构:

| 字段 | 作用 |
| --- | --- |
| `defaultMode` | `default`(每次问)/ `acceptEdits`(自动同意 Edit/Write)/ `plan`(进 plan mode)/ `bypassPermissions`(全开,危险) |
| `allow` | 白名单,匹配上自动放行 |
| `deny` | 黑名单,匹配上直接拒绝(优先级最高) |
| `ask` | 灰名单,即使 allow 也要问一次 |
| `additionalDirectories` | 允许 Claude 操作 cwd 之外的目录(默认禁止) |

> 团队合规规则写在 project,一旦合并所有人都受约束;**deny 比 allow 优先**——同一条规则同时写在 user 的 allow 和 project 的 deny,deny 赢。

### 4.4 `hooks`

生命周期钩子,**第 5 篇专讲**。这里只展示长相,知道它存在就行:

```json
{
  "hooks": {
    "PreToolUse": [...],
    "PostToolUse": [...],
    "UserPromptSubmit": [...],
    "Stop": [...],
    "Notification": [...]
  }
}
```

### 4.5 `statusLine`

底部状态栏。可以跑命令拼字符串,常见做法:显示当前模型、token 用量、git 分支、cwd 风格化。

```json
{
  "statusLine": {
    "type": "command",
    "command": "scripts/statusline.sh"
  }
}
```

`statusline.sh` 拿到一个 JSON,自己 parse,echo 出最终字符串。**第 11 篇会给完整例子**。

### 4.6 `outputStyle`

Claude 回复的"风格预设"。`default` / `explanatory` / `learning` 等等;也可以自定义(放 `~/.claude/output-styles/xxx.md`)。

### 4.7 `enabledMcpjsonServers` 与 `enableAllProjectMcpServers`

**MCP 安全相关**。`.mcp.json`(项目里的 MCP 配置)默认不会被信任跑——你需要显式 opt-in。

- `enabledMcpjsonServers: ["github", "postgres"]` → 只启用这两个
- `enableAllProjectMcpServers: true` → 全部启用(项目你完全信任时)

> 这是为了防止恶意 PR 偷偷加个 MCP server 偷你的环境。**默认拒绝、显式信任**才安全。

### 4.8 `apiKeyHelper`

跑一个脚本拿 API key。比硬编码 `ANTHROPIC_API_KEY` 强:

```json
{ "apiKeyHelper": "/usr/local/bin/get-anthropic-key" }
```

脚本里走 `aws secretsmanager get-secret-value`、`pass`、`1Password CLI`、`vault` 都行。**生产/团队场景强烈推荐**。

---

## 五、最小起手 settings(团队 + 个人各一份)

新建项目第一天,先把这两个放下去。

### 5.1 项目级 `.claude/settings.json`

```json
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Bash(npm test:*)",
      "Bash(npm run lint:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)"
    ],
    "deny": [
      "Bash(rm -rf*)",
      "Bash(git push --force*)",
      "Read(./.env)",
      "Read(./.env.*)"
    ],
    "ask": [
      "Bash(git push:*)",
      "Bash(npm publish:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/format.sh"
          }
        ]
      }
    ]
  }
}
```

意义:

- 跑测试、看 git 状态自动放行
- 删数据、强推、读 .env 一律禁止
- push、publish 之类的危险操作要二次确认
- 改文件后自动跑格式化

### 5.2 用户级 `~/.claude/settings.json`

```json
{
  "model": "claude-sonnet-4-7",
  "includeCoAuthoredBy": true,
  "cleanupPeriodDays": 30,
  "statusLine": {
    "type": "command",
    "command": "$HOME/.claude/statusline.sh"
  },
  "env": {
    "BASH_DEFAULT_TIMEOUT_MS": "180000"
  },
  "apiKeyHelper": "$HOME/.claude/get-key.sh"
}
```

意义:

- 默认 Sonnet(性价比);难任务 `/model opus` 切换
- 个人 status line 在所有项目通用
- API key 走脚本,不写明文

### 5.3 本机 `.claude/settings.local.json`

仅在你这台机器上调试用:

```json
{
  "permissions": {
    "allow": ["Bash(./scripts/local-debug.sh:*)"]
  },
  "env": {
    "DEBUG": "true"
  }
}
```

不会进 git,不会污染同事。

---

## 六、env / 变量 / shell 集成

### 6.1 常用环境变量

| 变量 | 作用 |
| --- | --- |
| `ANTHROPIC_API_KEY` | API key |
| `ANTHROPIC_BASE_URL` | 自定义 endpoint(走代理 / 自托管 gateway) |
| `BASH_DEFAULT_TIMEOUT_MS` | bash 默认超时(默认 2 分钟) |
| `BASH_MAX_TIMEOUT_MS` | bash 上限超时 |
| `MAX_THINKING_TOKENS` | 思考 token 上限 |
| `DISABLE_TELEMETRY` | 关闭数据上报 |
| `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` | 走 Bedrock / Vertex 而不是直连 Anthropic |

放进 `~/.zshrc` / `~/.bashrc` 都行,也可以放 settings 的 `env`(更隔离)。

### 6.2 多 endpoint 切换

很多公司走 Bedrock 或 Vertex,需要切上游:

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1
# 或
export CLAUDE_CODE_USE_VERTEX=1
export CLOUD_ML_REGION=us-central1
```

设完之后所有调用走对应云,**API key 不需要再设**(用云的鉴权)。

---

## 七、permission mode 四种(决策图)

```
                你想要的体验
                     │
        ┌────────────┴────────────┐
        ▼                          ▼
   要看每一步                  让它自己跑
        │                          │
        ▼                          ▼
     default                   ┌─────┴─────┐
   (问每一步)                  ▼            ▼
                          acceptEdits   bypass
                           (改文件      (全开,
                            自动同意,    极少用,
                            跑命令       一次性
                            还是问)      实验)
        ▲
        │ 大改动?
        ▼
      plan(先规划再执行,改前必读)
```

**日常推荐 `acceptEdits`**——文件改动你能事后看 diff,但跑命令、删东西仍然问;`bypassPermissions` 只在沙箱(VM / Docker)里用,**绝不在主机直接开**。

> 命令行也可以一次性切:`claude --permission-mode plan` / `--permission-mode acceptEdits`。

---

## 八、调试 settings 没生效

按这个清单排查:

1. **JSON 语法错误**?Claude Code 启动时会 warn,读不到的字段会被忽略。`jq . .claude/settings.json` 验证
2. **层级被覆盖**?后面层覆盖前面,看 `claude /status` 列出的实际 effective settings
3. **路径写错**?项目级是 `.claude/settings.json`(注意 `.claude` 是目录),user 级是 `~/.claude/settings.json`
4. **enterprise 强制**?某些字段公司管理策略不允许覆盖,`/status` 会标
5. **改了没重启**?多数字段热更新,但 hook / MCP / statusLine 改完最好重启 session
6. **`.gitignore` 没加 local**?`.claude/settings.local.json` 必须 gitignore,否则 push 出去全队都生效

---

## 九、踩坑

1. **把 API key 写进 project settings 然后 push**——这事每周都有人在 GitHub 公开仓库重演。**用 apiKeyHelper 或 local settings**
2. **`deny` 写得太严或太松**——太严会让 Claude Code 寸步难行(比如把 `Bash(*)` 全 deny);太松等于没写。**实际跑一周后再 audit 一次**
3. **`bypassPermissions` 主机直开**——某天它会问也不问就给你删点东西。**永远别在你不能丢的环境开**
4. **MCP 配置写进 user settings**——MCP 应该写项目级 `.mcp.json`,放进 user settings 等于偷偷给所有项目都装了
5. **三层都有 hook 但忘了哪个在跑**——hook 是合并的(各层的 hook 都会跑),debug 时按 `/status` 看 effective hooks
6. **不用 `enableAllProjectMcpServers` 的默认拒绝行为**——别人 PR 加个恶意 MCP server,你 pull 下来一开机就被偷数据。**保持默认 false**
7. **改完 settings 不 `/clear`**——某些字段(尤其 system prompt 相关)需要新 session 才生效,别在同一会话内反复纠结"为什么没变"
8. **enterprise / user / project 同名字段没看清优先级**——记住"后面覆盖前面",同时记住"deny 比 allow 强势"
9. **`additionalDirectories` 给得太宽**——给到 `/` 等于让 Claude Code 能动整个文件系统,**只给具体的 scratch 目录**
10. **没把 `.claude/settings.local.json` 加 gitignore**——开新项目第一件事就是把它加上,不然某天会把个人 token push 出去

---

下一篇:`03-核心工具与权限模型.md`,把 Read / Edit / Write / Bash / Glob / Grep 这六大内置工具讲透,讲清楚 permissions 的 matcher 写法(`Bash(npm test:*)` 里的语法到底怎么匹配)。
