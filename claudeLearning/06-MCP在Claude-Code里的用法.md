# MCP 在 Claude Code 里的用法

aiLearning/30 已经讲过 MCP 协议本身——三大原语、JSON-RPC、传输层。这一篇收窄到一个具体场景:**我是 Claude Code 用户,我想给我的 Claude Code 接外部工具,具体怎么搞**。和 Claude Desktop / Cursor 比,Claude Code 的 MCP 配置最灵活——三层、可远程、可团队共享、且**默认拒绝**保证安全。

> 一句话先记住:**Claude Code 的 MCP 配置三层 = 个人(`~/.claude.json`)+ 团队(`.mcp.json`)+ 私人本机(local 加锁)**。每一层管不同维度的 server。三层都不打开,你的 LLM 和外部世界毫无连接。

---

## 一、三层配置入门

```
优先级 / 范围
   ┌──────────────────────────────────────────┐
   │ 1. user 级:~/.claude.json                │  个人通用,所有项目可用
   │ 2. project 级:.mcp.json(项目根)        │  团队共享,提交进 git,但默认不跑
   │ 3. local 级:settings.local.json + claude mcp add 命令 │  本机临时
   └──────────────────────────────────────────┘
```

**关键差别**:

| 层 | 路径 | 谁能看到 | 默认行为 |
| --- | --- | --- | --- |
| user | `~/.claude.json` | 你自己 | 直接生效 |
| project | `.mcp.json`(git 提交) | 全队 | **默认拒绝**,需要显式 opt-in |
| local | `~/.claude.json` 里 project-scoped 的部分,或用 `claude mcp add` | 本机 | 直接生效但只在本机 |

**为什么 project 级默认拒绝**?

> 想象一个攻击者发个 PR,在 `.mcp.json` 里偷偷加一个"steal-env" server。如果 project 级直接生效,你 pull 下来一开 Claude Code,环境变量全被偷走。**默认拒绝 + 显式信任**才能防这种供应链攻击。

---

## 二、第一次配:用 `claude mcp add`

不要手写 JSON,用命令:

```bash
# 加一个本地 stdio server
claude mcp add github -- npx -y @modelcontextprotocol/server-github

# 加远程 streamable HTTP server
claude mcp add notion --url https://mcp.notion.com/mcp \
  --header "Authorization=Bearer $NOTION_TOKEN"

# 加项目级(写到当前项目 .mcp.json)
claude mcp add -s project github -- npx -y @modelcontextprotocol/server-github

# 加 user 级(写到 ~/.claude.json)
claude mcp add -s user obsidian -- npx -y mcp-obsidian
```

`-s` 控制写到哪一层:`local`(默认)/ `project` / `user`。

```bash
# 看现在生效的所有 server
claude mcp list

# 删除
claude mcp remove github

# 测试一个 server 的能力
claude mcp test github
```

> 第一次配 MCP **强烈推荐用命令**,不要手写。命令会自动校验、写到正确位置、帮你处理 env 注入。

---

## 三、`.mcp.json`:团队共享配置

`.mcp.json` 放在项目根目录,提交进 git,所有团队成员可见。

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "${DATABASE_URL}"]
    },
    "internal-deploy": {
      "url": "https://mcp-internal.company.com/mcp",
      "headers": { "Authorization": "Bearer ${INTERNAL_TOKEN}" }
    }
  }
}
```

**注意 `${VAR}` 语法**——MCP 配置支持环境变量插值。这样你能把 token 留在本机 env 里,而不是把 token 提交进 git。

### 3.1 如何让团队成员真的用上

`.mcp.json` 提交进 git 后,**默认每个成员第一次都会被问**:"这个项目想加载这些 MCP server,你信任吗?" 选信任后,这条信任记录写到 `~/.claude.json` 的 project-scoped 部分,以后不再问。

如果你想**默认信任所有**(团队完全 trust),在项目级 settings 里:

```json
{
  "enableAllProjectMcpServers": true
}
```

或者**只信任部分**:

```json
{
  "enabledMcpjsonServers": ["github", "postgres"]
}
```

> **企业项目第二种是常态**——只允许审过的 server,不允许 PR 偷偷加。

---

## 四、典型 server 配方

下面给一些 2026 年常用 server 的配置(已校验过的写法)。

### 4.1 GitHub

```bash
claude mcp add -s project github -- npx -y @modelcontextprotocol/server-github
```

env 里需要 `GITHUB_TOKEN`(读私有仓需要 `repo` scope)。

```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
}
```

### 4.2 Postgres / MySQL / SQLite

```json
"postgres": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-postgres",
           "postgresql://localhost:5432/mydb"]
}
```

> **生产数据库慎接**——Claude 拿到数据库 server 后能跑任何 query,**只接只读账号、或者本地开发库**。

### 4.3 Filesystem

```bash
claude mcp add fs -- npx -y @modelcontextprotocol/server-filesystem /Users/qjx/scratch
```

只暴露指定路径,不暴露根目录。

### 4.4 Playwright / Browser

```bash
claude mcp add browser -- npx -y @modelcontextprotocol/server-playwright
```

让 Claude 自己开浏览器、点页面、抓 DOM。

### 4.5 Notion / Slack / Linear(都是 streamable HTTP)

```bash
claude mcp add notion --url https://mcp.notion.com/mcp \
  --header "Authorization=Bearer $NOTION_TOKEN"

claude mcp add linear --url https://mcp.linear.app/mcp
```

> 这些 SaaS 官方 server 大多走 OAuth,Claude Code 会跳浏览器走完授权流程。

### 4.6 内部企业 server

公司内网 server:

```json
"internal-wiki": {
  "url": "https://mcp.company.internal/wiki",
  "headers": {
    "Authorization": "Bearer ${COMPANY_TOKEN}",
    "X-Team": "platform"
  }
}
```

---

## 五、在 session 里用 MCP server

配完之后,Claude 看到的工具会多出 `mcp__<server>__<tool>` 形式的:

```
mcp__github__create_issue
mcp__github__list_pull_requests
mcp__postgres__query
mcp__notion__search_pages
```

**对话里直接说"在 GitHub 创建一个 issue 描述 X"**,LLM 自动会调对应工具。

### 5.1 看哪些工具可用

```bash
/mcp           # 列出所有连上的 MCP server 和它们的工具
```

### 5.2 限制 session 内可用的 server

启动时:

```bash
claude --mcp-config '{"mcpServers": {"github": {...}}}'
```

只用某几个 server,临时排除其他。**调试某个 server 时很好用**。

### 5.3 权限管理

MCP 工具的 permissions 写法和内置工具一致:

```json
{
  "permissions": {
    "allow": [
      "mcp__github__list_pull_requests",
      "mcp__github__get_pull_request"
    ],
    "ask": [
      "mcp__github__create_pull_request",
      "mcp__github__merge_pull_request"
    ],
    "deny": [
      "mcp__postgres__delete_*",
      "mcp__github__delete_repository"
    ]
  }
}
```

`mcp__github__*` 这种通配也支持。

---

## 六、远程 server vs 本地 stdio:怎么选

| 维度 | stdio(本地) | Streamable HTTP(远程) |
| --- | --- | --- |
| 配置 | `command` / `args` | `url` |
| 启动 | 每个 session 起一个子进程 | 已经在云上跑 |
| 鉴权 | 通过 env 注入 token | OAuth / Bearer header |
| 状态 | 无状态 / 进程内状态 | 服务端可有多用户状态 |
| 场景 | 本地工具(filesystem、git、本地数据库) | SaaS / 内部平台 / 多人共享 |

**经验法则**:

- 接的是**本地资源**(文件、本地 DB、git) → stdio
- 接的是**SaaS 或内部平台** → Streamable HTTP
- 自己写的 server,**先 stdio 写,跑通了再考虑要不要远程化**

---

## 七、和 AI 系列里学到的 MCP 知识对应

| AI 系列 30 篇讲的 | 在 Claude Code 里对应 |
| --- | --- |
| Host / Client / Server 三方 | Host = Claude Code,Client = 内置 mcp client,Server = 你接的 |
| Tools / Resources / Prompts 三原语 | 全都能用,但 Claude Code 主要用 Tools(2026 年支持已成熟) |
| stdio / SSE / Streamable HTTP | Claude Code 三种都支持,**优先用 stdio 和 Streamable HTTP** |
| tool description 影响调用 | 同样适用——server 写 description 时考虑 LLM 怎么读 |
| 安全 | 三层配置 + 默认拒绝 + permissions matcher 三重护栏 |

---

## 八、常见问题排查

### 8.1 server 没出现在 `/mcp` 里

按这个顺序查:

1. `claude mcp list` 看配置有没有写进去
2. 看是不是 project 级但没 opt-in:`enableAllProjectMcpServers` 或 `enabledMcpjsonServers` 加上
3. server 进程是不是起不来:在终端手动跑一遍 `command + args`
4. env 变量:`echo $GITHUB_TOKEN` 看有没有
5. `claude --mcp-debug` 启动看具体报错

### 8.2 工具调用一直报 timeout

- 远程 server:网络 / 鉴权 token 过期
- 本地 stdio server:进程 hang 了,**重启 Claude Code session**
- 大返回值:server 一次返回 20MB,Claude 这边超时;**让 server 端做分页**

### 8.3 工具描述不准 / LLM 调错工具

MCP server 的 tool description 是 LLM 的唯一线索。**如果 server 是你写的**,改 description;**如果是别人写的**,在 CLAUDE.md 里给一段提示:

```markdown
# CLAUDE.md
- `mcp__internal__deploy` 仅用于 staging,生产部署用 `mcp__internal__deploy_prod`
- `mcp__postgres__query` 默认 read-only,写库用 `mcp__postgres__execute`
```

### 8.4 OAuth 跳转不工作

```bash
# 重新走 OAuth 授权
claude mcp reauth notion

# 看当前 token 状态
claude mcp status notion
```

---

## 九、最佳实践(对 Claude Code 用户)

1. **先用社区 server,再考虑写自己的**——文件系统、git、GitHub、数据库都有官方/优质社区版本
2. **企业内部系统封 server,不要硬编码到 prompt**——内部 wiki / 监控 / 部署 / 工单,封成 server 全队复用
3. **生产数据库走只读账号**——MCP server 把 DB 暴露给 LLM,**写权限 = 直接出事**
4. **token 走 env,不进 git**——`.mcp.json` 里用 `${VAR}`,实际 token 在本机 env / secrets manager
5. **新接 server 先看 source / 看权限**——开源 server 至少看一眼它能调什么 API、要什么权限
6. **`enableAllProjectMcpServers: false`**(默认)——除非你完全 trust 项目里所有协作者
7. **写好 CLAUDE.md 描述每个 server 的用法**——LLM 看到工具描述会调,但**业务约束**只有 CLAUDE.md 能告诉它

---

## 十、踩坑

1. **`.mcp.json` 提交了 token**——下班后整个 internet 看你的 GitHub PAT。**只用 `${VAR}` 语法**
2. **`.mcp.json` 加了 server 但没人用得了**——团队都没 opt-in。**项目级 settings 里写 `enabledMcpjsonServers`**
3. **本地 stdio server 跑不起来**——`npx -y` 第一次会拉包,慢;装好之后写绝对路径或 cache 一下
4. **`mcp__xxx__yyy` matcher 没生效**——permissions 里写错了 server name 或 tool name,**先 `/mcp` 看准确名字再写**
5. **生产数据库直接接 server**——某天 LLM 帮你 `DELETE FROM users WHERE 1=1`。**只读账号 + ask 权限拦写操作**
6. **server 太多,LLM 选错**——一开 Claude Code 接了 12 个 server,LLM 在 200 个工具里挑;**只接当前项目用得到的**
7. **远程 server 没鉴权**——把 streamable HTTP server 暴露在公网,任何人都能调。**OAuth 或 Bearer 必备**
8. **跨 session 不知道哪些工具来自 MCP**——每次都要 `/mcp` 看;习惯了之后建议在 status line 显示 server 数
9. **不更新 server**——MCP 协议在演进,2024 早期写的 server 可能在 2026 的 client 里不能用。**定期更新版本**
10. **混淆 user 级 vs project 级**——团队共享的 server 写到了 `~/.claude.json`,新人 clone 项目根本看不到这些工具。**团队 server 一律 project 级**

---

下一篇:`07-Subagents子代理.md`,讲 Task 工具、`.claude/agents/` 目录、Explore / Plan / general-purpose 三种内置 subagent、什么时候开 subagent(隔离上下文 / 并行 / 专业化)、subagent 的输出怎么回流、prompt 设计要点。
