# MCP 协议

写过一段时间 LLM 应用你会发现一个荒谬的事实:**每个客户端都在重新发明 tool 接入**。Cursor 一套配置、Claude Desktop 一套配置、Windsurf 又一套。你写一个数据库查询工具,接 ChatGPT 要适配 OpenAI Function Calling 格式,接 Claude Desktop 要适配它的 plugin 协议,接 IDE 又要写 LSP 风格的扩展。**Model Context Protocol(MCP)就是来终结这件事的**——一次实现,各处可用。

> 一句话先记住:**MCP 之于 AI 工具,大概等于 LSP 之于编辑器**。LSP 让一个语言服务器同时给 VSCode、Vim、Emacs 用;MCP 让一个工具同时给 Claude Desktop、Cursor、Claude Code、ChatGPT 用。

---

## 一、为什么需要 MCP

2024 年之前,LLM 应用接工具的现状是这样:

| 客户端 | 工具接入方式 |
| --- | --- |
| ChatGPT | OpenAI Plugins(后来废弃)/ GPTs / Function Calling |
| Claude Desktop | 自定义 plugin 配置 |
| Cursor | 内置 + 一些专有协议 |
| 自研 Agent | 直接在代码里写 tool function |

问题很明显:

1. **工具开发者重复造轮子**。同一个"读 GitHub issue"的工具,要为五个客户端各写一遍。
2. **客户端封闭生态**。用户被锁在某个 app 里,工具不通用。
3. **tool schema 标准混乱**。OpenAI 一套 JSON schema、Anthropic 早期一套、各家 IDE 又一套。

2024 年 11 月 Anthropic 推出 MCP(Model Context Protocol),把这件事变成了**开放协议**。到 2026 年,**Claude Desktop、Cursor、Claude Code、Windsurf、ChatGPT、Zed、各类 IDE 插件**都已经原生支持。社区里有几千个 MCP server,文件系统、浏览器、Notion、Slack、GitHub、各种数据库……基本上你想接的都有现成的。

> MCP 的核心价值不是"协议本身设计得有多好",而是**它成了事实标准**。在标准化领域,**早一步且开放**比"设计完美"重要得多。

---

## 二、MCP 是什么:Server / Client / Host 三方关系

MCP 是个 client-server 协议,但严格来说有三方角色:

| 角色 | 谁来扮演 | 职责 |
| --- | --- | --- |
| Host | LLM 应用本身(Claude Desktop / Cursor) | 跑 LLM、管理用户会话 |
| Client | Host 内部的 MCP 客户端模块 | 和 server 通信 |
| Server | 你写的工具进程 | 暴露 resources / tools / prompts |

**关键关系**:**一个 Host 可以连多个 Server**,每个 Server 可以暴露多个工具。Host 把所有 server 暴露的能力**汇总**给 LLM,LLM 决定调用哪个。

```
┌──────────────────────────────────────┐
│            Host (Claude Desktop)      │
│                                       │
│  ┌──────┐  ┌──────┐  ┌──────┐        │
│  │Client│  │Client│  │Client│        │
│  └──┬───┘  └──┬───┘  └──┬───┘        │
└─────┼─────────┼─────────┼────────────┘
      │ stdio   │ stdio   │ HTTP/SSE
┌─────▼───┐ ┌───▼────┐ ┌──▼──────┐
│ MCP     │ │ MCP    │ │ MCP     │
│ Server  │ │ Server │ │ Server  │
│ (FS)    │ │(GitHub)│ │(DB)     │
└─────────┘ └────────┘ └─────────┘
```

> 这种架构最妙的地方在于**进程隔离**:每个 server 是独立进程,挂了不影响 host;权限可以按 server 粒度授予;某个 server 出 bug 你只换它一个,Host 和其他 server 不受影响。

---

## 三、三大原语:Resources、Tools、Prompts

MCP server 能暴露三种东西,每种用途完全不同:

| 原语 | 作用 | 谁主动 | 类比 |
| --- | --- | --- | --- |
| Resources | 暴露**只读数据**(文件、API 返回、DB 查询结果) | Host/User 选择 | REST 的 GET |
| Tools | 暴露**可执行操作**(写文件、发请求、改 DB) | LLM 决定调用 | RPC / Function Call |
| Prompts | 暴露**预定义的 prompt 模板** | User 触发 | slash command |

**别混淆**:

- Resources 是**给 LLM 读的上下文素材**,LLM 不主动调,通常由 user 在 UI 里选"把这个 resource 加到对话",或者 Host 自动注入相关 resource。
- Tools 才是**LLM 主动调用**的,每次 LLM 决定"我要做某个动作",它去调 tool。
- Prompts 是**给用户触发的快捷指令**,常见形式是 IDE 里的 slash command,比如 `/summarize_pr`。

> 大多数初学者只用 Tools。Resources 和 Prompts 经常被忽略,但**Resources 在 RAG 场景很有用**——你不必让 LLM 主动调一个"read_file" tool 才能拿到内容,直接把文件作为 resource 暴露,Host 会按需注入。

---

## 四、协议层:JSON-RPC over stdio / SSE / HTTP+SSE

MCP 用 **JSON-RPC 2.0** 做消息层,但**传输层有三种**:

| 传输方式 | 适用 | 特点 |
| --- | --- | --- |
| stdio | 本地工具(默认) | Host 启动子进程,通过 stdin/stdout 通信。最简单、最常用 |
| HTTP + SSE(deprecated) | 早期远程方案 | 双向用 SSE 推 + HTTP 收。已被 Streamable HTTP 替代 |
| Streamable HTTP | 远程工具(2025 起主流) | 单一 HTTP 端点,流式响应,支持鉴权 |

**stdio 是开发本地工具时的默认选择**:Host 启动你的 server 进程、通过标准输入输出读写 JSON-RPC 消息,你只要在代码里 `print` JSON 就行(框架会帮你处理)。

```
Host → Server (stdin):  {"jsonrpc":"2.0","id":1,"method":"tools/list"}
Server → Host (stdout): {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
```

**Streamable HTTP 是远程工具的标准**:你把 server 部署成一个 HTTP 服务,Host 通过 URL 连接;支持流式返回(stream)和会话恢复。SaaS 化的 MCP server(比如 Notion、Slack 提供的官方 server)基本都是这个模式。

> stdio 简单但只能本地;HTTP 可以远程但要处理鉴权、TLS、网络。**新工具先用 stdio 写、跑通再考虑要不要远程化**。

---

## 五、实操:用 Python mcp SDK 写一个最简 MCP Server

直接上代码。装一下官方 Python SDK:

```bash
pip install "mcp[cli]"
```

写一个暴露"算术工具"和"读环境信息"的 server:

```python
# server.py
from mcp.server.fastmcp import FastMCP
import platform
import datetime

mcp = FastMCP("demo-server")

# Tool 1:加法
@mcp.tool()
def add(a: int, b: int) -> int:
    """两个整数相加,返回它们的和。"""
    return a + b

# Tool 2:获取当前时间
@mcp.tool()
def now(timezone: str = "UTC") -> str:
    """返回当前时间字符串,timezone 默认 UTC。"""
    if timezone == "UTC":
        return datetime.datetime.utcnow().isoformat() + "Z"
    return datetime.datetime.now().isoformat()

# Resource:暴露系统信息(只读)
@mcp.resource("system://info")
def system_info() -> str:
    """系统信息,只读。"""
    return f"OS: {platform.system()} {platform.release()}\nPython: {platform.python_version()}"

# Prompt:预定义 prompt 模板
@mcp.prompt()
def code_review(code: str) -> str:
    """生成一个代码审查的 prompt。"""
    return f"请审查以下代码,关注 bug、风格、性能:\n\n```\n{code}\n```"

if __name__ == "__main__":
    mcp.run()   # 默认走 stdio
```

跑一下:

```bash
python server.py
```

它会等待 stdin 输入。要测试,推荐用官方的 inspector:

```bash
mcp dev server.py
```

会起一个 web UI,可视化看到所有 tools / resources / prompts,还能直接调用测试。

**给 Claude Desktop 用**:编辑配置文件(macOS 在 `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "demo": {
      "command": "python",
      "args": ["/absolute/path/to/server.py"]
    }
  }
}
```

重启 Claude Desktop,你就能看到 demo server 的 tools 出现在工具列表里了。

> 写 MCP server 别一上来就上 HTTP。**先用 FastMCP + stdio 跑通**,在 inspector 里调通了,再决定是不是要部署远程。绝大多数工具 stdio 已经够用。

---

## 六、Client 端集成

2026 年主流客户端都已原生支持 MCP,配置方式略有差别:

| 客户端 | 配置位置 | 备注 |
| --- | --- | --- |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json`(macOS) | 最早原生支持 |
| Claude Code | 项目内 `.mcp.json` 或全局 `~/.claude.json` | 支持 project / user / local 三层 |
| Cursor | `~/.cursor/mcp.json` 或 `.cursor/mcp.json` | 项目级和全局都支持 |
| Windsurf | 项目设置面板 / `mcp_config.json` | 类似 Cursor |
| ChatGPT(2025+) | Custom Connectors UI | 通过 Streamable HTTP 接入 |
| Zed | `~/.config/zed/settings.json` 的 `context_servers` | |

通用 schema 大致都是:

```json
{
  "mcpServers": {
    "<name>": {
      "command": "...",
      "args": [...],
      "env": {...}
    }
  }
}
```

**远程 server**(Streamable HTTP)配置略有不同,通常是:

```json
{
  "mcpServers": {
    "notion": {
      "url": "https://mcp.notion.com/mcp",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

> Claude Code 的 MCP 配置最灵活——分 project 级 / user 级 / local 级三层,team 共享的 server 提交进 git 的 `.mcp.json`,个人 token 放 user 级,实验性的放 local。**用对层级,跨项目复用就不用反复配置**。

---

## 七、生态现状(2026)

到 2026 年 5 月,MCP 生态已经相当成熟。常用 server 大致分几类:

| 类别 | 代表 server | 用途 |
| --- | --- | --- |
| 文件系统 | filesystem(官方) | 读写本地文件 |
| 浏览器 | playwright / puppeteer | 自动化浏览器 |
| 代码托管 | github / gitlab / bitbucket | 看 PR、issue、commit |
| 知识库 | notion / confluence / linear | 读写工作区 |
| 协作工具 | slack / discord / gmail | 读消息、发消息 |
| 数据库 | postgres / mysql / mongodb / sqlite | 直接查询 |
| 搜索 | brave-search / google-search | web 搜索 |
| 云服务 | aws / gcp / azure / cloudflare | 操作云资源 |
| 监控 | sentry / datadog / grafana | 查日志、监控 |
| 设计工具 | figma | 读取设计稿 |
| 视频/媒体 | youtube / spotify | 内容索引 |

**官方 awesome 列表**: github.com/modelcontextprotocol/servers 维护着一份长清单。**很多企业内部也开始把私有系统封成 MCP server**——内部 wiki、内部监控、内部部署平台,工程师可以直接在 Cursor / Claude Code 里操作。

> MCP 的网络效应已经形成。**2026 年新写一个 LLM 工具,默认应该写成 MCP server**——同样的工作量,你的工具自动支持 N 个客户端。

---

## 八、和 Function Calling / Tool Use 的关系

很多人会问:既然有 OpenAI Function Calling 和 Anthropic Tool Use,为什么还要 MCP?

**答案是:它们解决的不是同一个问题**。

| 概念 | 是什么 | 谁定义 | 职责层 |
| --- | --- | --- | --- |
| Function Calling / Tool Use | LLM **能调用工具**这个能力本身 | 模型供应商(OpenAI / Anthropic) | 模型层 |
| MCP | 工具**怎么分发、怎么发现、怎么连接**的协议 | Anthropic + 社区 | 应用层 / 协议层 |

类比:

| 编程世界 | LLM 世界 |
| --- | --- |
| HTTP(传输协议) | Function Calling(模型能力) |
| RESTful 接口规范 | MCP(分发协议) |
| OpenAPI/Swagger 文档格式 | MCP 的 tool schema |

**典型链路**:

```
用户 → Host → 把所有 MCP server 的 tools 汇总 → LLM(用 Tool Use 决定调哪个)→ Host 路由到对应 MCP server → Server 执行 → 结果回传给 LLM → LLM 生成最终回答
```

Tool Use 是 LLM 在**模型层**学会的"我要调 tool"能力;MCP 是**应用层**让"工具自动出现在 LLM 面前"的协议。**两者配合工作,不矛盾**。

> 不要纠结"MCP 是不是要替代 Function Calling"——它们一个是协议、一个是能力。就像没人问"REST 是不是要替代 TCP"。

---

## 九、给开发者的建议

1. **新写工具默认 MCP server**。现在写个内部 LLM 工具,就别再硬编码到某个框架里了。**写成 MCP server,用 stdio 模式,立刻支持 Claude Desktop / Cursor / Claude Code 全家桶**。
2. **Resources 和 Tools 分清楚**。可执行的操作用 Tools,只读上下文用 Resources。**别什么都做成 Tool**——一个"read_file" tool 看起来万能,但 LLM 每次都要主动调,token 贵且慢;暴露成 resource,Host 可以做缓存、可以让用户主动选。
3. **Tool 描述写细致**。MCP tool 的 description 是 LLM 看到的——它决定 LLM 在什么场景下调你的 tool。**写得清楚 → LLM 调得准;写得含糊 → LLM 乱调或不调**。
4. **stdio 优先**。本地工具一律 stdio,直到你真的需要远程化(多用户共享、有状态服务、要鉴权)再考虑 HTTP。
5. **复用社区 server**。文件系统、git、浏览器、数据库……这些都有官方/社区现成实现,**别自己重写**。把精力花在你业务独有的 server 上。

---

## 十、踩坑

1. **stdio 模式的调试地狱**。stdio 通信你不能 print 调试(任何 stdout 输出都被当成协议消息,直接破坏对话)。**必须 print 到 stderr,或写日志文件**。第一次玩这个坑几乎人人都踩。
2. **权限管理是头等大事**。MCP server 可以读文件、删数据、发请求,**接错了 server 等于把根权限交给 LLM**。生产环境务必:server 进程降权运行、敏感操作 server 内部要二次确认、定期 audit 哪些 server 能接哪些 host。
3. **协议版本不兼容**。MCP 规范在快速演进,2024 / 2025 / 2026 已有几次小迭代(尤其传输层从 SSE 转向 Streamable HTTP)。**SDK 版本和客户端版本要对得上**,否则 tool 不显示或调用失败,且报错信息往往很模糊。
4. **环境变量别硬编码**。MCP server 经常要读 API key、token,**写在代码里直接死**——下次别人用就得改代码。**通过 env 配置传**,在客户端配置文件里设 env。
5. **大返回值会爆 context**。一个 query 数据库的 tool 一次返回 10 万行,直接把 LLM 的 context 撑爆。**Tool 的 output 要主动分页 / 截断 / 总结**,server 端就做。
6. **同步阻塞**。stdio 是同步通信,你的 tool 跑 30 秒,Host 就阻塞 30 秒。**长任务用 progress 通知**(MCP 协议支持 streaming progress),或者直接拆成"启动任务 + 查询状态"两个 tool。
7. **没做 schema 校验**。LLM 偶尔会传错参数(类型不对、字段缺失),server 没校验直接崩溃。**用 pydantic / FastMCP 的类型签名,框架会帮你做校验并返回友好错误信息**。
8. **不做 dry-run**。写文件、删数据、发邮件这种破坏性 tool,**至少加一个 dry_run 参数**,默认 false。LLM 测试阶段调错了不至于真的把数据删了。
9. **远程 server 没鉴权**。Streamable HTTP 暴露在公网上,没鉴权等于公开 API。**至少做 token 鉴权,理想情况上 OAuth**(MCP 规范已支持)。
10. **以为 MCP server 就一定安全**。**MCP 不是沙箱**——server 能干什么完全取决于 server 自己代码。第三方 server 接进来前**看看源码、看看权限**,别盲目信任 README。

---

下一篇:`31-框架选型对比.md`,横向对比 LangChain、LlamaIndex、Claude Agent SDK、AutoGen 这些主流框架,讲清楚每个的定位、什么场景该用哪个。
