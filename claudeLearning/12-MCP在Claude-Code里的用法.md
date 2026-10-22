# MCP 在 Claude Code 里的用法

aiLearning/30 讲过 MCP 协议本身:一个让模型以统一方式调用外部工具和数据的开放协议。这一篇站在**使用者**的角度:怎么把 MCP server 接进 Claude Code、配置放在哪、怎么认证、怎么控制它们对上下文的开销,以及组织怎么管控可用的 server。写 server 的内容在 36-39 篇。

> 一句话先记住:**MCP 给 Claude 接上"手",skill 教 Claude 怎么用好这双手**。MCP server 提供连接和工具,skill 提供你团队的使用规范(数据库 schema、查询习惯、消息格式)。两者是互补关系,不是二选一。

---

## 一、什么时候该接 MCP

触发信号很具体:**你一直在从某个浏览器标签页里复制数据给 Claude,而它自己看不到那个系统**。这时就该把那个系统接成 MCP server。典型例子:

- 查 issue 跟踪器、读 Sentry 报错、看监控面板
- 查数据库、读内部文档或 wiki
- 发 Slack 消息、更新工单状态
- 控制浏览器、操作设计工具

如果只是"一个命令行工具就能搞定"(`gh`、`psql`、`kubectl`),**直接让 Claude 用 Bash 跑 CLI 往往更简单**,不必再包一层 MCP。

---

## 二、添加 server:四种传输方式

### 2.1 远程 HTTP(推荐)

```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp

# 带固定 token
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer your-token"
```

HTTP(也就是协议里的 streamable HTTP)是远程 server 的首选,支持面最广,也支持 OAuth。

### 2.2 本地 stdio

```bash
claude mcp add --transport stdio --env AIRTABLE_API_KEY=xxx airtable \
  -- npx -y airtable-mcp-server
```

**`--` 很重要**:它前面是 Claude Code 自己的参数,后面原样交给 server 进程。漏掉 `--`,server 的参数(比如 `--port`)会被 Claude Code 当成自己的参数解析。

stdio server 作为本地进程运行,适合需要直接访问本机资源的工具。Claude Code 会在它的环境里设 `CLAUDE_PROJECT_DIR` 指向项目根。

### 2.3 SSE(已弃用)和 WebSocket

- **SSE** 已弃用。只提供 SSE 端点的服务也可以用 `--transport http` 添加,Claude Code 会先试 HTTP 再自动回退
- **WebSocket**(`"type": "ws"`)适合需要主动推送事件的远程 server,只支持通过 header 认证,用 `claude mcp add-json` 或 `.mcp.json` 配置

### 2.4 从 JSON 添加

```bash
claude mcp add-json github \
  '{"type":"http","url":"https://api.githubcopilot.com/mcp/","headers":{"Authorization":"Bearer YOUR_GITHUB_PAT"}}'
```

别的客户端的配置说明里给的是 JSON 片段时,直接用这个。注意:**有 `url` 却没写 `type` 的条目会被当成 stdio,直接报错**。

---

## 三、三种作用域

| 作用域 | 在哪生效 | 团队共享 | 存在哪 |
| --- | --- | --- | --- |
| **local**(默认) | 只有当前项目 | 否 | `~/.claude.json` 里这个项目的条目下 |
| **project** | 只有当前项目 | 是,提交到 git | 项目根的 `.mcp.json` |
| **user** | 你的所有项目 | 否 | `~/.claude.json` |

```bash
claude mcp add --transport http stripe https://mcp.stripe.com                 # local
claude mcp add --transport http shared --scope project https://example.com/mcp # project
claude mcp add --transport http hubspot --scope user https://mcp.hubspot.com/anthropic
```

> 注意 MCP 的 "local" 和 settings 的 "local" 不是一回事:**MCP 的 local 作用域存在家目录的 `~/.claude.json` 里**,而 settings 的 local 是项目里的 `.claude/settings.local.json`。

**同名 server 的优先级**:local > project > user > 插件提供的 > claude.ai connectors。高优先级的整条配置生效,字段不会跨作用域合并。

### 3.1 团队共享:`.mcp.json`

```json
{
  "mcpServers": {
    "internal-docs": {
      "type": "http",
      "url": "${DOCS_MCP_URL:-https://docs-mcp.internal.example.com/mcp}",
      "headers": { "Authorization": "Bearer ${DOCS_MCP_TOKEN}" }
    },
    "db": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@example/db-mcp"],
      "env": { "DATABASE_URL": "${DATABASE_URL}" }
    }
  }
}
```

- 支持 `${VAR}` 和 `${VAR:-默认值}` 展开,可用在 `command`、`args`、`env`、`url`、`headers` 里。**密钥用环境变量,不要写死在提交的文件里**
- 出于安全考虑,**项目里的 `.mcp.json` server 在交互会话中首次使用前要你批准**。`claude mcp reset-project-choices` 重置这些选择
- `-p`、Agent SDK、云端会话里没法弹窗批准,要控制加载哪些 server,用 `disabledMcpjsonServers`、`--strict-mcp-config`(只用 `--mcp-config` 传入的)等方式

---

## 四、管理与状态

```bash
claude mcp list          # 列出所有 server 及健康状态
claude mcp get notion    # 查看某个 server 的详情
claude mcp remove notion # 删除(远程 server 的 OAuth token 一并删除)
```

会话里用 `/mcp` 查看连接状态、认证、启用或停用某个 server。常见状态:

| 状态 | 含义 |
| --- | --- |
| `✔ Connected` | 正常 |
| `! Needs authentication` | 需要登录 |
| `✘ Failed to connect` | 连不上 |
| `⏸ Pending approval` | 项目 `.mcp.json` 里的 server 还没被你批准 |
| `⊘ Disabled for this project` | 在本项目里被停用 |

不想删除只想暂时停用:在 `/mcp` 里关掉。远程 server 掉线后 Claude Code 会**自动重连**。

---

## 五、认证

### 5.1 OAuth

```bash
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
```

然后在会话里 `/mcp` 选这个 server,浏览器里完成登录。token 安全存储、自动刷新。

也可以不进会话,直接在 shell 里登录:

```bash
claude mcp login sentry
claude mcp login sentry --no-browser   # SSH 或无图形界面时,打印授权链接
claude mcp logout sentry
```

几个细节:

- **`-p` 和 Agent SDK 里没法走 OAuth 流程**,要先在交互会话里或用 `claude mcp login` 完成登录
- 有些 server 要求预先注册回调地址,用 `--callback-port` 固定端口,或配合 `--client-id` 使用预配置的客户端凭证
- 启动时如果有 server 需要登录,会显示一条提示

### 5.2 自定义 header 与动态凭证

需要短期令牌、内部签名等非 OAuth 认证时,用 `headersHelper` 在连接时动态生成 header。配置了 `Authorization` header 却被拒绝时,Claude Code 会报连接失败,而不是回退到 OAuth。

### 5.3 claude.ai 的 connectors

用 claude.ai 账号登录时,你在 claude.ai 里添加的 connectors(MCP server)会**自动出现在 Claude Code 里**,不用重复配置。Team / Enterprise 上只有管理员能添加。组织可以把某些 connector 工具设为必须询问,这时你的 allow 规则对它们无效。

---

## 六、上下文开销:tool search

早期每接一个 MCP server,它所有工具的完整定义都会塞进上下文,接多了光工具描述就占掉一大块。现在**tool search 默认开启**:

- 会话开始时只加载**工具名和 server 说明**
- 完整的 schema 在 Claude 需要某个工具时才通过 `ToolSearch` 加载
- 所以多接几个 server 对上下文的影响很小

需要某个 server 的工具始终可见(比如核心工具每轮都会用),在配置里设 `"alwaysLoad": true`;反过来,`"alwaysLoad": false` 强制它的所有工具走搜索。

`/context all` 能看到每个已加载的 MCP 工具占多少 token。

> tool search 解决了上下文开销,**但没有解决"工具太多选错"和"权限面变大"**。只接当前真正需要的 server,不用的在 `/mcp` 里停掉。

---

## 七、大输出和长调用

- **输出超过 10,000 token 会警告**,默认上限 25,000 token,用 `MAX_MCP_OUTPUT_TOKENS` 调整
- 超过上限的成功结果会**存成文件**,对话里只放文件路径,Claude 需要时再读
- server 作者可以给单个工具声明 `_meta["anthropic/maxResultSizeChars"]`,允许它返回更大的结果(比如完整的数据库 schema)
- **主对话里运行超过 2 分钟的 MCP 调用会自动转到后台**,Claude 拿到任务 ID 继续干别的,结果完成后以通知形式送达;在 `/tasks` 里查看或停止

---

## 八、MCP 的其他能力

| 能力 | 在 Claude Code 里怎么用 |
| --- | --- |
| **Resources** | 像引用文件一样用 `@` 引用 server 暴露的资源 |
| **Prompts** | 作为命令出现在 `/` 菜单里,显示为 `/server名:prompt名 (MCP)` |
| **Elicitation** | server 在调用中途请求你输入时,弹出表单或打开链接;可以用 `Elicitation` hook 自动回应 |
| **需要人工确认的工具** | server 给工具标 `_meta["anthropic/requiresUserInteraction"]: true` 后,**任何权限模式下**每次调用都要确认,也没有"不再询问" |
| **Channels** | server 主动往会话里推送消息、告警、webhook(18 篇) |

### 反过来:把 Claude Code 当作 MCP server

```bash
claude mcp serve
```

以 stdio server 的形式运行,其他支持 MCP 的应用可以连接它、调用它的工具。启动后终端没有输出是正常的——它在等客户端连接。

---

## 九、权限

MCP 工具的名字是 `mcp__<server>__<tool>`,权限规则按这个写:

```json
{
  "permissions": {
    "allow": ["mcp__github__get_*", "mcp__internal-docs__*"],
    "ask":   ["mcp__github__create_pull_request"],
    "deny":  ["mcp__db__execute_write"]
  }
}
```

server 名里的 `.` 和空格会变成 `_`;插件提供的 server 名形如 `plugin_<插件名>_<server名>`。hook 的 matcher 也可以用 `mcp__github__.*` 这样的正则。

---

## 十、组织管控

| 模式 | 效果 | 配置 |
| --- | --- | --- |
| 禁用 MCP | 除少数例外,不加载任何 server | `managed-mcp.json` 里放空的 server 列表 |
| 固定部署 | 所有人用同一组 server,不能自己加 | `managed-mcp.json` 写上这组 server |
| 统一提供 | 所有人都有你提供的远程 server,同时保留自己的 | managed settings 的 `managedMcpServers` |
| 审批目录 | 只能添加名单里的 server | `allowedMcpServers` + `allowManagedMcpServersOnly: true` |
| 黑名单 | 拦截已知有问题的,其余放行 | `deniedMcpServers` |

接入第三方 server 前要评估它的可信度:**MCP server 能看到你给它的数据,它返回的内容也会进入 Claude 的上下文**——一个恶意或被攻破的 server 可以借此做提示注入。38 篇会细讲。

---

## 十一、排查

1. `claude mcp list` 看健康状态,`/mcp` 看详细信息
2. **连不上**:stdio server 先在终端里单独跑一下命令,看有没有报错;远程 server 检查 URL 和网络
3. **需要认证**:`/mcp` 里重新登录,或 `claude mcp login`
4. **项目 server 没加载**:是不是还没批准(`⏸ Pending approval`)、被 `disabledMcpjsonServers` 拒绝了
5. **恢复会话后工具没了**:启动时用 `--mcp-config` 传的配置要重新传
6. **从 Claude Desktop 迁移**:可以导入 Claude Desktop 里已有的 server 配置

---

## 十二、踩坑

1. **能用 CLI 解决的也包成 MCP**——`gh`、`psql` 直接用 Bash 跑更简单
2. **stdio 命令漏了 `--`**——server 的参数被 Claude Code 吃掉
3. **把 token 写死在 `.mcp.json` 里提交**——用 `${VAR}` 引用环境变量
4. **JSON 配置里有 `url` 没写 `type`**——被当成 stdio,直接报错
5. **分不清 MCP 的 local 作用域和 settings 的 local**——前者在 `~/.claude.json`,后者在项目里
6. **在 `-p` 里用需要 OAuth 的 server**——先在交互会话里登录好
7. **server 越接越多**——上下文开销虽然被 tool search 压住了,但选错工具和权限面的问题还在
8. **以为 allow 规则能放行组织设为 ask 的 connector**——不能,每次都会问
9. **不评估第三方 server 就接入**——它返回的内容会进入上下文,是提示注入的入口
10. **用了已弃用的 SSE**——能用 HTTP 就用 HTTP

---

下一篇:`13-Subagents子代理.md`,讲内置子代理、自定义子代理的定义方式、前台和后台运行、fork 当前对话、嵌套子代理和持久记忆。
