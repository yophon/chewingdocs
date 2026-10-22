# MCP Server 入门

12 篇站在使用者的角度讲了怎么把 MCP server 接进 Claude Code,33 篇讲了 Agent SDK 里进程内的自定义工具。这一层换到另一边:**自己写 MCP server**。一旦你把内部系统包装成 MCP server,它就能同时被 Claude Code、Claude Desktop、Agent SDK、Managed Agents,以及 VS Code、Cursor 等任何支持 MCP 的客户端使用——写一次,到处可用。

aiLearning/30 讲过 MCP 协议的基本结构(host / client / server 三方、JSON-RPC、传输方式)。这一篇不重复那些,而是讲 **2026 年的 MCP 有什么变化、用当前的 SDK 怎么写一个 server、怎么调试和接进 Claude Code,以及工具该怎么设计**。

> 一句话先记住:**MCP server 的用户是模型**。人读文档,模型只读工具的名字、描述和参数 schema;人看到报错会去查日志,模型只看到你返回的那段错误文字。一个 server 好不好用,几乎完全取决于这几段文字写得好不好。

---

## 一、先认识三种原语

server 能暴露三种东西,区别在于**谁决定使用它**:

| 原语 | 由谁控制 | 是什么 | 例子 | 在 Claude Code 里 |
| --- | --- | --- | --- | --- |
| **Tools** | 模型 | 模型调用来执行动作的函数 | 调 API、写数据库 | Claude 自己决定调用 |
| **Resources** | 应用 | 应用加载进上下文的数据 | 文件内容、配置、文档 | 用户用 `@` 引用 |
| **Prompts** | 用户 | 用户按名字调用的消息模板 | 斜杠命令 | 出现在 `/` 菜单里 |

一个类比:resource 像 HTTP 的 `GET`(读数据、不改东西),tool 像 `POST`(做事、可能有副作用),prompt 像一条保存好的查询,由用户按名字运行。

实践中**绝大多数 server 主要提供 tools**,因为这是模型能主动使用的唯一一种。resources 和 prompts 是锦上添花,39 篇再细讲。

---

## 二、2026 年的 MCP:先知道变了什么

MCP 协议用日期做版本号。当前版本是 **2026-07-28**,相对上一版 2025-11-25 是一次很大的修订,两个官方 SDK 也随之发布了 v2。如果你以前写过 MCP server,或者网上的教程是 2025 年的,这些变化要先知道:

| 变化 | 以前 | 2026-07-28 |
| --- | --- | --- |
| 连接 | 先 `initialize` 握手,建立会话 | **没有握手、没有会话**。每个请求在 `_meta` 里自带协议版本和客户端能力 |
| HTTP 会话 | `Mcp-Session-Id` 头把请求绑定到某个连接 | 去掉了。任何副本都能处理任何请求,普通的负载均衡就够了 |
| 服务端向客户端发请求(elicitation、sampling、roots) | server 主动推送请求 | **改为多轮请求(MRTR)**:server 返回"需要更多输入",客户端带着答案重试原请求 |
| 变更通知 | HTTP GET 流、`resources/subscribe` | 统一成一个 `subscriptions/listen` 长连接 |
| Roots、Sampling、协议级日志 | 正常功能 | **已弃用**(仍可用,新实现不要再加) |
| `ping` | 有 | 移除 |
| 结果 | — | 都带 `resultType`;列表类结果带缓存提示 `ttlMs` / `cacheScope` |
| 发现 | 握手时交换 | 新增必须实现的 `server/discover` |

对写 server 的人来说,好消息是 **SDK 把两个时代都处理了**:Python SDK v2 和 TypeScript SDK v2 写出来的同一个 server,既能回应老客户端的 `initialize`,也能处理新客户端的无状态请求,不用任何配置。Claude Code 也已经在和支持新版本的 HTTP、stdio server 协商 2026-07-28,其他的照旧用老协议连接。

**真正需要你改变写法的只有一处**:如果工具需要在执行中途向用户要信息(比如确认、补充参数),不能再用"server 推送一个请求"的方式了,要改用 MRTR。39 篇细讲。

---

## 三、用 Python 写一个 server

### 3.1 安装

```bash
uv add "mcp[cli]"          # 或 pip install "mcp[cli]";需要 Python 3.11+
```

`pip install mcp` 现在装的是 2.x。`cli` 扩展提供 `mcp dev`、`mcp run`、`mcp install` 命令。

### 3.2 一个完整的 server

```python
# server.py
from typing import Annotated, Literal
from pydantic import BaseModel, Field
from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

mcp = MCPServer("Bookshop")

CATALOG = {
    "Dune": {"author": "Frank Herbert", "year": 1965, "genre": "fiction", "stock": 3},
    "Neuromancer": {"author": "William Gibson", "year": 1984, "genre": "fiction", "stock": 0},
    "The Selfish Gene": {"author": "Richard Dawkins", "year": 1976, "genre": "non-fiction", "stock": 5},
}

class Book(BaseModel):
    title: str
    author: str
    year: int = Field(description="首次出版年份")
    in_stock: bool

@mcp.tool(annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False))
def search_books(
    query: Annotated[str, Field(description="书名或作者的一部分,不区分大小写")],
    genre: Literal["fiction", "non-fiction"] | None = None,
    limit: Annotated[int, Field(ge=1, le=50, description="最多返回几条")] = 10,
) -> list[Book]:
    """按书名或作者搜索书目,返回书名、作者、出版年份和是否有货。"""
    q = query.lower()
    hits = [
        Book(title=t, author=b["author"], year=b["year"], in_stock=b["stock"] > 0)
        for t, b in CATALOG.items()
        if (q in t.lower() or q in b["author"].lower()) and (genre is None or b["genre"] == genre)
    ]
    return hits[:limit]

@mcp.tool()
def reserve_book(title: Annotated[str, Field(description="完整书名,先用 search_books 查到")]) -> str:
    """为当前用户预留一本有货的书,保留 24 小时。"""
    book = CATALOG.get(title)
    if book is None:
        raise ToolError(f"没有书名为 {title!r} 的书。请先用 search_books 搜索,使用返回结果里的完整书名。")
    if book["stock"] == 0:
        raise ToolError(f"{title!r} 目前无货,无法预留。")
    book["stock"] -= 1
    return f"已预留《{title}》,请在 24 小时内到店取书。"

@mcp.resource("catalog://titles")
def titles() -> str:
    """书目中所有书名,每行一个。"""
    return "\n".join(sorted(CATALOG))

@mcp.prompt()
def recommend(interest: str) -> str:
    """根据兴趣推荐书目。"""
    return f"我对「{interest}」感兴趣。请用 search_books 查一下书目,推荐三本有货的书,并说明理由。"

if __name__ == "__main__":
    mcp.run()          # 不带参数 = stdio
```

注意你**没有写**的东西:没有 JSON Schema(类型标注就是 schema),没有参数解析和校验,没有协议处理。SDK 从函数名、docstring、类型标注里读出一切:

- 函数名 → 工具名;docstring → 工具描述
- `Annotated[..., Field(description=...)]` → 参数说明;`ge` / `le` / `Literal` → schema 约束,调用前就会校验
- 有默认值的参数是可选的
- 返回 Pydantic 模型或带类型的值 → 自动生成 `outputSchema`,同时返回结构化结果(`structuredContent`)和文本
- `ToolAnnotations(read_only_hint=True)` → 告诉客户端这是只读工具(33 篇讲过,Claude Code 据此允许并发调用)

### 3.3 错误:三种抛法,三种结果

| 抛出 | 结果 | 谁看到 |
| --- | --- | --- |
| `ToolError("...")` | 正常返回一个 `is_error=True` 的结果,内容是你的消息 | **模型**,它可以据此改正参数再试 |
| `MCPError(code=..., message=...)` | 整个请求失败,返回 JSON-RPC 错误 | **宿主应用**,模型什么都看不到 |
| 其他任何异常 | `is_error=True`,但内容只有一句"工具执行出错",细节进日志 | 模型只知道失败了,不知道为什么 |

**绝大多数时候你要的是 `ToolError`**:模型选的参数,模型来改。一句"没有这本书,请先用 search_books 搜索"就能让它自己纠正。另外**永远不要 `return` 一段错误信息**——返回值的 `is_error` 是 `False`,模型和客户端都会以为工具成功了。

### 3.4 Context

工具参数里声明一个 `ctx: Context`,就能拿到请求上下文:请求 ID、读取本 server 的资源、报告进度。

```python
from mcp.server.mcpserver import Context

@mcp.tool()
async def import_catalog(urls: list[str], ctx: Context) -> str:
    """从一组 URL 导入书目记录。"""
    for i, url in enumerate(urls, start=1):
        await fetch_and_import(url)
        await ctx.report_progress(i, total=len(urls), message=f"已导入 {url}")
    return f"导入了 {len(urls)} 条记录"
```

`ctx` 不会出现在模型看到的参数 schema 里。v2 里同步的 `def` 工具会放到工作线程执行,不会阻塞事件循环。

---

## 四、用 TypeScript 写一个 server

```bash
npm init -y && npm pkg set type=module         # SDK 只提供 ES module
npm install @modelcontextprotocol/server zod tsx
```

TypeScript SDK v2 拆成了几个包:`@modelcontextprotocol/server`、`@modelcontextprotocol/client`,以及 Express / Fastify / Hono / Node HTTP 的中间件包。旧的 `@modelcontextprotocol/sdk` 是 v1,还会维护一段时间。

```typescript
// src/index.ts
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

function createServer(): McpServer {
  const server = new McpServer({ name: "bookshop", version: "1.0.0" });

  server.registerTool(
    "search_books",
    {
      description: "按书名或作者搜索书目,返回书名、作者和是否有货",
      inputSchema: z.object({
        query: z.string().describe("书名或作者的一部分,不区分大小写"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      outputSchema: z.object({
        books: z.array(z.object({ title: z.string(), author: z.string(), inStock: z.boolean() })),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      const books = search(query).slice(0, limit ?? 10);
      return {
        content: [{ type: "text", text: JSON.stringify(books) }],
        structuredContent: { books },
      };
    },
  );

  return server;
}

void serveStdio(createServer);
console.error("bookshop MCP server running on stdio");     // 日志只能写 stderr
```

- `registerTool(名字, 配置, 处理函数)`。v1 里的 `server.tool()` 已经被 `registerTool` 取代
- schema 用 Standard Schema:Zod v4、Valibot、ArkType 都行。SDK 据此生成 JSON Schema、在调用前校验参数、推断处理函数的参数类型
- 参数不合法时,SDK 返回一个 `isError: true` 的结果,模型读到错误信息会自己改
- 有 `outputSchema` 时,SDK 会在返回前校验 `structuredContent`
- **stdout 是协议通道**。stdio server 里一个 `console.log` 就会破坏 JSON-RPC 流,日志一律写 `console.error`(Python 同理,不要 `print` 到 stdout)

---

## 五、调试:MCP Inspector

不要一上来就接进 Claude Code 调试——出了问题你分不清是 server 的问题还是模型没选对工具。先用 **MCP Inspector** 直接调用:

```bash
uv run mcp dev server.py                                     # Python
npx @modelcontextprotocol/inspector npx tsx src/index.ts     # TypeScript / 任意 stdio server
```

它会打开一个网页,每种原语一个标签页:列出工具和它们的 schema、填表调用、看原始结果。要检查的东西:

- 工具的描述和每个参数的说明是不是你想让模型看到的样子
- 非法参数是不是被拒绝了,错误信息是否说清了怎么改
- 结构化结果和文本结果是否一致
- 错误路径:不存在的 ID、空结果、下游服务超时

---

## 六、接进 Claude Code

```bash
# Python:everything after -- 是启动命令
claude mcp add bookshop -- uv run --with "mcp[cli]" mcp run /abs/path/to/server.py

# TypeScript
claude mcp add bookshop -- npx tsx /abs/path/to/src/index.ts
```

然后在会话里用 `/mcp` 看连接状态和工具列表,再给一个需要它的任务:"帮我找几本 Gibson 的书,有货的话预留一本"。

几个要点(12 篇有完整的说明):

- 本地 server 默认就是 stdio,不用写 `--transport`
- 用**绝对路径**。宿主启动 server 时的工作目录和 `PATH` 不一定是你以为的;找不到 `uv` 时也写它的绝对路径
- 想让团队共享,用 `--scope project` 写进仓库的 `.mcp.json`
- Claude Desktop 可以用 `uv run mcp install server.py` 自动写配置
- 改了 server 代码后,在 `/mcp` 里重新连接它

---

## 七、测试

Python SDK 的 `Client` 可以直接连 server 对象,在内存里通信,不用进程、不用端口:

```python
# test_server.py
import pytest
from mcp import Client
from server import mcp

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.fixture
async def client():
    async with Client(mcp, raise_exceptions=True) as c:
        yield c

@pytest.mark.anyio
async def test_search(client):
    result = await client.call_tool("search_books", {"query": "gibson"})
    assert not result.is_error
    assert result.structured_content["result"][0]["title"] == "Neuromancer"

@pytest.mark.anyio
async def test_reserve_unknown(client):
    result = await client.call_tool("reserve_book", {"title": "不存在的书"})
    assert result.is_error
    assert "search_books" in result.content[0].text      # 错误信息里要告诉模型下一步怎么做
```

TypeScript SDK 也有对应的内存连接方式。**把错误信息也纳入测试**:它们是写给模型的接口,改坏了和改坏 API 一样严重。

---

## 八、工具设计的原则

协议和 SDK 只解决"能不能调",工具设计决定"模型会不会用对"。

### 8.1 名字和描述

- **名字具体**:`search_books` 好过 `query`,`create_refund` 好过 `process`。Claude Code 默认开启工具搜索(12、33 篇),名字和描述也是被搜索的对象
- **描述写清楚做什么、返回什么、什么时候用**:"按书名或作者搜索书目,返回书名、作者、出版年份和是否有货"
- **每个参数都要有说明**,包括格式和来源:"完整书名,先用 search_books 查到"。这是模型得到的唯一文档
- 工具之间有先后关系时,在描述里说出来

### 8.2 粒度

| 倾向 | 例子 | 问题 |
| --- | --- | --- |
| 太细 | `get_user`、`get_orders`、`get_order_items`、`get_shipment` | 模型要串好几次调用,每次结果都进上下文 |
| 太粗 | `execute_sql(query)` | 模型要知道整个数据库结构,权限也无法控制 |
| 合适 | `get_order_status(order_id)` 返回订单、商品、物流的摘要 | 一次调用回答一个完整的问题 |

**按用户要完成的任务设计工具,而不是照搬后端的 API**。37 篇会在企业场景里展开。

### 8.3 输入

- 用枚举(`Literal`)代替自由文本,用范围约束(`ge` / `le`)代替口头说明
- 列表类工具一定要有 `limit`,必要时加分页、过滤条件
- 参数名用业务语言:`order_id` 而不是 `oid`

### 8.4 输出

- **只返回模型需要的**:一个订单查询返回 50 个字段的原始 JSON,大部分都是噪音,还占上下文
- 有结构的数据返回结构化结果,同时给一段简洁的文本
- 结果可能很大时,截断并说明"还有 N 条,用 offset 继续",或者返回资源链接让模型按需读取
- Claude Code 默认在 MCP 工具输出超过 1 万 token 时警告、超过 2.5 万 token 时截断(`MAX_MCP_OUTPUT_TOKENS` 可调),确实需要返回大结果的工具可以声明 `_meta["anthropic/maxResultSizeChars"]`(12 篇)

### 8.5 稳定

- 工具名一旦发布就不要改。改名等于删掉旧工具、加一个新工具,用户的权限规则(`mcp__bookshop__search_books`)会全部失效
- `tools/list` 按**固定顺序**返回——新协议明确要求这一点,因为工具定义在请求的最前面,顺序一变,客户端的 prompt 缓存就全部失效(25 篇)

---

## 九、踩坑

1. **照着 2025 年的教程写 `from mcp.server.fastmcp import FastMCP`**——v2 里已经改成 `from mcp.server import MCPServer`,旧路径直接报错
2. **stdio server 里往 stdout 打日志**——破坏协议流,客户端断开。日志写 stderr
3. **出错时 `return "错误:..."`**——`is_error` 是 false,模型以为成功了。抛 `ToolError`
4. **该用 `ToolError` 的地方用了 `MCPError`**——模型什么都看不到,没法自我纠正
5. **工具描述只写了一个词**——模型不知道什么时候用、返回什么
6. **把后端 API 一比一包装成工具**——模型要串很多次调用,上下文被中间结果塞满
7. **列表工具没有 `limit`**——一次返回几千条,直接撞上输出上限
8. **配置里用相对路径或裸命令**——宿主的工作目录和 `PATH` 不同,启动失败
9. **工具执行中途用 `ctx.elicit()` 向用户要信息**——在新协议的连接上会失败,改用 MRTR(39 篇)
10. **发布后改工具名**——等于换了个工具,用户的权限规则全部失效

---

下一篇:`37-企业内部MCP-Server.md`,讲怎么把公司的内部系统包装成一个好用、可控的 MCP server:工具怎么按任务划分、读写怎么分开、用户身份怎么传递、危险操作怎么确认、生命周期和连接池,以及打包分发给团队。
