# Agent SDK 扩展:工具、MCP 与子代理

32 篇的 agent 只用了内置工具:读文件、改文件、跑命令。真实的应用总要接入自己的东西:查订单的内部接口、公司的工单系统、某个数据库,还有"代码审查交给一个只读的专门角色"这类分工。这一篇讲给 SDK agent 加能力的几种方式:**自定义工具、外部 MCP server、工具搜索、子 agent、skills 和 plugins**。

> 一句话先记住:**在 Agent SDK 里,自定义工具就是一个进程内的 MCP server**。你用 `@tool` 写一个函数,包进 `create_sdk_mcp_server`,和外部 MCP server 一样挂到 `mcp_servers` 上。工具名统一是 `mcp__<server>__<tool>`,权限、工具搜索、子 agent 的工具限制,都按这个名字来。

---

## 一、几种扩展方式

| 方式 | 是什么 | 适合 |
| --- | --- | --- |
| 自定义工具 | 你的函数,跑在你的进程里 | 调内部 API、查数据库、领域逻辑 |
| 外部 MCP server | 现成的 MCP server(本地进程或远程 URL) | GitHub、Slack、数据库等已有的集成 |
| 子 agent | 有独立上下文、独立提示词、受限工具的 agent | 分工、并行、隔离大量中间结果 |
| Skills | 文件系统里的 `SKILL.md`,按需加载 | 可复用的操作规范和流程 |
| Plugins | 打包好的 skills + agents + hooks + MCP | 跨项目复用一整套能力 |
| Hooks | 在循环的关键点执行你的代码 | 拦截、审计、改写(34 篇) |

这些和 Claude Code 里的同名功能(10-14 篇)是同一套机制,只是配置方式从文件变成了代码。

---

## 二、自定义工具

### 2.1 定义和注册

```python
from typing import Annotated, Any
import httpx
from claude_agent_sdk import tool, create_sdk_mcp_server, query, ClaudeAgentOptions, ResultMessage

@tool(
    "get_order",
    "按订单号查询订单状态、金额和物流信息",
    {"order_id": Annotated[str, "订单号,形如 ORD-20261021-0001"]},
)
async def get_order(args: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"https://internal.example.com/orders/{args['order_id']}")
    if r.status_code == 404:
        return {"content": [{"type": "text", "text": f"订单 {args['order_id']} 不存在,请确认订单号"}],
                "is_error": True}
    return {"content": [{"type": "text", "text": r.text}]}

orders = create_sdk_mcp_server(name="orders", version="1.0.0", tools=[get_order])

async for message in query(
    prompt="ORD-20261021-0001 这单发货了吗?",
    options=ClaudeAgentOptions(
        mcp_servers={"orders": orders},
        allowed_tools=["mcp__orders__get_order"],       # 或 "mcp__orders__*"
    ),
):
    if isinstance(message, ResultMessage) and message.subtype == "success":
        print(message.result)
```

TypeScript 用 Zod 定义参数:

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const getOrder = tool(
  "get_order",
  "按订单号查询订单状态、金额和物流信息",
  { order_id: z.string().describe("订单号,形如 ORD-20261021-0001") },
  async (args) => {
    const r = await fetch(`https://internal.example.com/orders/${args.order_id}`);
    return { content: [{ type: "text", text: await r.text() }] };
  },
);
const orders = createSdkMcpServer({ name: "orders", version: "1.0.0", tools: [getOrder] });
```

一个工具四要素:**名字、描述、参数 schema、处理函数**。描述是 Claude 决定"什么时候调用"的依据,要写清楚它做什么、返回什么(24 篇讲过工具描述怎么写)。这个 MCP server 跑在你的进程里,不是单独的进程。

### 2.2 参数

- Python 的字典写法要求每个键都必填。可选参数改用完整的 JSON Schema 写法,不放进 `required`,在处理函数里用 `args.get()` 取默认值
- TypeScript 在 Zod 字段上加 `.optional()`
- 用 `Annotated[float, "说明"]`(Python)或 `.describe()`(TS)给字段加 Claude 能看到的说明

### 2.3 返回值

| 字段 | 说明 |
| --- | --- |
| `content`(必填) | 结果块数组:`text`、`image`、`audio`、`resource`、`resource_link` |
| `structuredContent` | 可选,机器可读的 JSON 结果 |
| `is_error`(Python)/ `isError`(TS) | 标记失败,让 Claude 知道要换个做法 |

图片块是 base64 内嵌的,没有 URL 字段;要返回网上的图,在处理函数里下载、编码再返回。

### 2.4 错误处理

**处理函数抛异常不会让 agent 循环停下**:SDK 的 MCP server 会把异常转成错误结果,Claude 看到原始异常信息后可能重试或换方法。所以问题不是"会不会崩",而是"Claude 看到的错误信息够不够它采取行动"。像上面 404 那样**自己捕获、自己写错误信息**,告诉 Claude 哪里错了、该怎么办,比一句 `KeyError: 'data'` 有用得多。

### 2.5 注解与并行

```python
from claude_agent_sdk import ToolAnnotations

@tool("get_order", "...", {...}, annotations=ToolAnnotations(readOnlyHint=True))
```

| 注解 | 默认 | 作用 |
| --- | --- | --- |
| `readOnlyHint` | `false` | **唯一有实际效果的**:标为只读的工具可以和其他只读工具并发执行 |
| `destructiveHint` / `idempotentHint` / `openWorldHint` | — | 仅作说明 |

注解只是元数据,不是强制:标了只读的工具照样能写磁盘。保持注解和实际行为一致。

---

## 三、控制工具的可见性和权限

这里有两层,很容易混:

| 选项 | 层级 | 效果 |
| --- | --- | --- |
| `tools=["Read", "Grep"]` | **可见性** | 只有列出的内置工具出现在 Claude 的上下文里,其余内置工具移除;不影响 MCP 工具 |
| `tools=[]` | 可见性 | 去掉所有内置工具,Claude 只能用你的 MCP 工具 |
| `allowed_tools` | **权限** | 列出的工具免确认执行;没列出的仍然可见,调用时走权限流程 |
| `disallowed_tools` 写裸名(`"Bash"`) | 两者 | 从上下文移除 |
| `disallowed_tools` 写规则(`"Bash(rm *)"`) | 权限 | 工具仍可见,只拒绝匹配的调用 |

要彻底去掉一个内置工具,用 `tools` 不列它,或者在 `disallowed_tools` 里写裸名。只写一条规则时工具还在,Claude 可能浪费一轮去尝试。

**只想让 Claude 用你的工具**(比如一个客服 agent 不该碰文件系统):`tools=[]` + 你的 MCP server。

---

## 四、连接外部 MCP server

### 4.1 三种传输

```python
options = ClaudeAgentOptions(
    mcp_servers={
        # 本地进程(stdio):文档给的是一条命令时用这个
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/srv/docs"],
            "env": {"LOG_LEVEL": "warn"},
        },
        # 远程(HTTP / SSE):文档给的是一个 URL 时用这个
        "tickets": {
            "type": "http",
            "url": "https://mcp.internal.example.com/mcp",
            "headers": {"Authorization": f"Bearer {os.environ['TICKETS_TOKEN']}"},
        },
        # 进程内(SDK server):你自己写的工具
        "orders": orders,
    },
    allowed_tools=["mcp__filesystem__read_file", "mcp__tickets__*", "mcp__orders__*"],
)
```

- 认证:stdio 通过 `env` 传凭据,远程 server 通过 `headers` 传。OAuth 需要你的应用自己完成授权流程,把拿到的 access token 放进 header
- 也可以从 `.mcp.json` 加载:`setting_sources` 包含 `"project"` 时,项目里的 `.mcp.json` 会被读取(12 篇)
- **MCP 工具必须显式授权**。不在 `allowed_tools` 里,Claude 能看到工具,但调用会走权限流程(没有回调就被拒绝)
- server 名里的 `.` 和空格会被替换成 `_`,影响完整的工具名

### 4.2 检查连接状态

每次 `query()` 开始时的 `init` 系统消息里带着每个 server 的状态:`pending`、`connected`、`failed`、`needs-auth`、`disabled`。

```python
if isinstance(message, SystemMessage) and message.subtype == "init":
    bad = [s for s in message.data.get("mcp_servers", []) if s.get("status") in ("failed", "needs-auth")]
    if bad:
        log.warning("MCP server 不可用:%s", bad)
```

**`pending` 不等于失败**:可能是还没连上、工具列表来自缓存、首次调用时才连接。真正要处理的是 `failed` 和 `needs-auth`。

### 4.3 启动等待

stdio server、没有缓存工具列表的远程 server、进程内 server 会让第一轮等它连接,超时由 `MCP_TIMEOUT` 控制(默认 30 秒)。`.mcp.json` 和 plugin 里的 server 往往在 init 时还是 pending,第一轮最多等 2 秒左右,没连上的在后台继续连接。想自己控制第一轮的等待时间,在 `env` 里设 `CLAUDE_CODE_MCP_STARTUP_WAIT_MS`。

---

## 五、工具搜索

工具多了,光定义就占掉大量上下文。**工具搜索默认开启**:Claude 只看到一个紧凑的工具清单,需要时搜索,把最相关的几个(默认最多 5 个)加载进上下文。这对外部 MCP server 和你的 SDK server 都适用。

| `ENABLE_TOOL_SEARCH` | 行为 |
| --- | --- |
| 不设 / `true` | 开启,定义延迟加载(很老的模型、部分平台会自动退回全量加载) |
| `auto` | 先全量加载,可延迟的定义达到上下文窗口的 10% 时才开启 |
| `auto:N` | 同上,阈值改为 N% |
| `false` | 关闭,每轮都加载全部定义 |

```python
options = ClaudeAgentOptions(
    env={"ENABLE_TOOL_SEARCH": "auto:5"},       # Python 的 env 合并到继承的环境变量上
    ...
)
```

TypeScript 的 `env` 会**替换**子进程的环境,要写成 `env: { ...process.env, ENABLE_TOOL_SEARCH: "auto:5" }`,否则 `PATH` 这些都没了。

让工具更容易被搜到:

- 名字具体:`search_slack_messages` 比 `query_slack` 能匹配更多请求
- 描述里写关键词:"按关键词、频道或日期范围搜索 Slack 消息"
- 在 system prompt 里列出有哪些类别的工具:`"append": "你可以搜索用于操作 Slack、GitHub、Jira 的工具。"`
- 工具少于十个左右时,全量加载反而更快;某个 server 的工具每次都要用,可以给它设 `alwaysLoad: true` 不参与延迟

---

## 六、子 agent

### 6.1 用代码定义

```python
from claude_agent_sdk import AgentDefinition

options = ClaudeAgentOptions(
    allowed_tools=["Read", "Grep", "Glob", "Agent"],          # Agent 工具用来调用子 agent
    agents={
        "security-reviewer": AgentDefinition(
            description="安全审查专家。审查认证、授权、输入校验相关的代码时使用。",
            prompt="你是安全审查专家。只报告可利用的真实漏洞,每个给出文件、行号和利用方式。",
            tools=["Read", "Grep", "Glob"],                   # 只读
            model="sonnet",
            effort="high",
        ),
        "test-runner": AgentDefinition(
            description="运行测试并分析失败原因。",
            prompt="你负责运行测试。报告失败的用例、错误信息和最可能的原因。",
            tools=["Bash", "Read", "Grep"],
        ),
    },
)
```

`AgentDefinition` 的常用字段:

| 字段 | 说明 |
| --- | --- |
| `description`(必填) | **什么时候用它**——Claude 据此决定是否委派 |
| `prompt`(必填) | 子 agent 的 system prompt |
| `tools` / `disallowedTools` | 工具白名单 / 黑名单;`mcp__server__*` 可以整组排除 |
| `model` | `opus`、`sonnet`、`haiku`、`inherit` 或完整模型 ID |
| `effort`、`maxTurns`、`permissionMode` | 这个子 agent 自己的设置 |
| `skills` | 启动时预加载的 skills |
| `mcpServers` | 只给这个子 agent 的 MCP server |
| `background` | 设为 `True` 一直在后台运行 |

Python 里多词字段保持 camelCase(`disallowedTools`、`mcpServers`),和线上格式一致。也可以用 `.claude/agents/` 下的 Markdown 文件定义(13 篇),同名时代码定义的优先。即使什么都不定义,Claude 也可以调用内置的 `general-purpose` 子 agent。

### 6.2 子 agent 能看到什么

| 能看到 | 看不到 |
| --- | --- |
| 自己的 `prompt` 和 Agent 工具传来的任务描述 | 父 agent 的对话历史和工具结果 |
| 项目 CLAUDE.md(设了 `omitClaudeMd` 就没有) | 父 agent 的 system prompt |
| 工具定义(继承的,或 `tools` 指定的子集) | 没有在 `skills` 里列出的 skill 内容 |

**父 agent 传给子 agent 的只有那段任务描述**,所以文件路径、错误信息、已经做出的决定都要写进去。子 agent 做完只把最终报告交回,父 agent 的上下文只增加一段总结——这就是 29 篇说的"用子 agent 隔离大量中间结果"。

子 agent 的最终消息在交给父 agent 前会被扫描:模仿 `<system-reminder>` 这类控制标签、模仿 `Human:` / `Assistant:` 回合标记的内容会被转义,防止子 agent 读到的恶意内容借它的报告影响父 agent。

### 6.3 前台、后台和分叉

- 子 agent **默认在后台运行**:Agent 工具立即返回 `async_launched`,报告在之后的回合到达。Claude 下一步需要报告时会等它。想强制等待,在 prompt 里说"运行 test-runner 并等待结果"
- **分叉(fork)**:复制当前对话而不是从零开始的子 agent,Claude 用 `subagent_type: "fork"` 就能启动。不想要就加 `disallowed_tools=["Agent(fork)"]`

### 6.4 识别和限制

识别:工具调用名是 `"Agent"`(`init` 消息的工具列表里叫 `"Task"`,老版本的调用也叫 `"Task"`,两个都匹配);来自子 agent 内部的消息带 `parent_tool_use_id`。

一个 prompt 可能长成一棵 agent 树,要设上限:

| 限制 | 设置 | 默认 |
| --- | --- | --- |
| 嵌套深度 | `env` 里的 `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | 3 层;设 1 禁止子 agent 再派生 |
| 并发数 | `env` 里的 `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` | 20 |
| 总花费 | `max_budget_usd` | 不限,包括所有子 agent |

新模型(尤其是 Opus 5 及以后)比以前更愿意委派。用 `claude_code` 预设时,Claude Code 会在提示词里加一句"除非被要求,不要调用 Agent 工具";用自定义提示词时没有这句,要自己加。不管怎样,**限制一定要设**——提示词只是引导,限制才是强制。

---

## 七、Skills 与命令

skills 只能以文件形式存在(`.claude/skills/<name>/SKILL.md`),SDK 没有用代码注册 skill 的接口。它们通过 `setting_sources` 被发现,所以设了 `setting_sources=[]` 就没有 skills。

```python
options = ClaudeAgentOptions(
    setting_sources=["project"],
    skills=["release-notes", "db-migration"],   # 只允许这两个;"all" 全部;[] 一个都不给
)
```

- 列表里只能写精确的名字,通配符会让 `query()` 在开始前就报错
- 不在列表里的 skill,模型看不到,Skill 工具也拒绝调用——但文件还在磁盘上,用 `Read` 仍然读得到
- **把 `/<name>` 写进 prompt 就能直接调用**一个命令或 skill,不受 `skills` 列表限制。`/compact` 压缩历史,`/clear` 清空上下文
- 不存在的 `/<name>` 不会报错,会作为普通消息发给 Claude,并附一条说明

---

## 八、Plugins

```python
options = ClaudeAgentOptions(plugins=[
    {"type": "local", "path": "./plugins/acme-standards"},
])
```

- SDK 只接受 `"local"` 类型。marketplace 上的插件要先下载到本地
- 路径指向插件根目录(`.claude-plugin/`、`skills/`、`agents/` 的父目录),相对路径按 `cwd` 解析
- 插件里的 skill 用 `/plugin-name:skill-name` 调用,`skills` 列表里写 `plugin:skill`

14 篇讲了怎么做插件。对 SDK 来说,插件是把"一套公司规范"整体交给 agent 的最方便的方式。

---

## 九、怎么选

| 需求 | 用什么 |
| --- | --- |
| 调用你自己的接口或函数 | 自定义工具 |
| 接入已有的第三方系统 | 现成的 MCP server |
| 同一套工具要给 Claude Code 用户和你的 SDK agent 一起用 | 写成独立的 MCP server(36-39 篇) |
| 一个步骤会读大量内容,只需要结论 | 子 agent |
| 几个独立的检查可以同时做 | 多个子 agent 并行 |
| 某个角色只该有只读权限 | 子 agent + `tools` 白名单 |
| 一套很长的操作规范,只有部分任务用到 | skill |
| 把 skills、agents、hooks、MCP 打包复用 | plugin |

40 篇会从整个 Claude 生态的角度再讨论一次这些扩展机制的选型。

---

## 十、踩坑

1. **自定义工具没加进 `allowed_tools`**——Claude 看得到,调用时走权限流程,没有回调就被拒绝
2. **`allowed_tools` 里写成 `get_order`**——完整名字是 `mcp__orders__get_order`
3. **想去掉内置工具却只在 `disallowed_tools` 里写了规则**——工具仍可见,用 `tools` 白名单或写裸名
4. **处理函数直接把异常抛出去**——Claude 只看到一行原始异常,自己捕获并写清楚错误和建议
5. **给有副作用的工具标 `readOnlyHint`**——它会和其他工具并发执行
6. **把 init 消息里的 `pending` 当成连接失败**——只有 `failed` 和 `needs-auth` 才是
7. **TypeScript 的 `env` 没展开 `process.env`**——子进程丢了 `PATH`,什么都跑不起来
8. **子 agent 的任务描述只写"修一下那个 bug"**——它看不到父 agent 的上下文,文件和错误信息都要写进去
9. **不设子 agent 的深度、并发和预算**——一个 prompt 可能长成一棵很贵的 agent 树
10. **设了 `setting_sources=[]` 又奇怪 skills 为什么不见了**——skills 是从文件系统配置里发现的

---

下一篇:`34-Agent-SDK控制与部署.md`,讲怎么在生产环境里管住 SDK agent:权限判定顺序和 `can_use_tool` 回调、hooks、结构化输出、文件检查点、成本追踪和可观测性,以及容器化部署、会话存储和安全加固。
