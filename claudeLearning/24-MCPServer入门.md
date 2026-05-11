# MCP Server 入门(写一个自己的 server)

aiLearning/30 讲过 MCP 协议;06 篇讲了在 Claude Code 里怎么"用"现有的 server。这一篇收窄到一个具体动作:**你自己写一个 server**——给团队 / 给开源社区 / 给自己的工作流。MCP 的真正价值不在协议设计,而在**写一次,所有 LLM 客户端都能用**。

> 一句话先记住:**用 FastMCP(Python)或 @modelcontextprotocol/sdk(TS),5 行就能起一个 server,30 行就能给 Claude Code / Cursor / Claude Desktop 用上**。stdio 优先、严格 input schema、写好 description——三件事做对,你的 server 就比社区平均水平好。

---

## 一、Python:FastMCP 起步

```bash
pip install "mcp[cli]"
```

`server.py`:

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-server")

@mcp.tool()
def add(a: int, b: int) -> int:
    """两个整数相加。"""
    return a + b

@mcp.tool()
def search_users(query: str, limit: int = 10) -> list[dict]:
    """按关键词搜用户(name / email 模糊匹配),最多 limit 条。"""
    rows = db.users.search(query=query, limit=min(limit, 100))
    return [{"id": r.id, "name": r.name, "email": r.email} for r in rows]

if __name__ == "__main__":
    mcp.run()   # 默认 stdio
```

跑:

```bash
python server.py
```

这是一个完整的 MCP server。**FastMCP 自动**:

- 把函数签名转成 input_schema
- 把 docstring 转成 description
- 处理 JSON-RPC 通信
- 处理错误

---

## 二、TypeScript:`@modelcontextprotocol/sdk`

```bash
npm i @modelcontextprotocol/sdk zod
```

`server.ts`:

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const server = new Server({ name: "my-server", version: "1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "add",
      description: "两个整数相加",
      inputSchema: {
        type: "object",
        properties: { a: { type: "integer" }, b: { type: "integer" } },
        required: ["a", "b"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "add") {
    const { a, b } = z.object({ a: z.number(), b: z.number() }).parse(req.params.arguments);
    return { content: [{ type: "text", text: String(a + b) }] };
  }
  throw new Error(`unknown tool ${req.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

> Python 版更短,TS 版更显式。**写业务逻辑两个都行;选你团队主语言**。

---

## 三、连进 Claude Code 测试

`claude mcp add my-server -- python /path/to/server.py`

或写到 `.mcp.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "python",
      "args": ["/abs/path/to/server.py"]
    }
  }
}
```

启动 Claude Code → `/mcp` 看到 my-server → `mcp__my-server__add` 工具可用。

---

## 四、用 inspector 调试

```bash
mcp dev server.py
```

会起一个 web UI(类似 Swagger),你可以:

- 看到所有 tools / resources / prompts
- 手动调用每个 tool 测试
- 看 JSON-RPC 详细请求 / 响应
- debug schema / 错误返回

> **写 server 必装 inspector**——比直接在 Claude Code 里调试快 5 倍。

---

## 五、Tool 设计规范

### 5.1 description 是 LLM 唯一的"何时调"信息

```python
# 烂
@mcp.tool()
def search(q: str): "搜东西"

# 好
@mcp.tool()
def search_orders(query: str, limit: int = 20):
    """按订单号 / 用户邮箱 / 商品名搜订单。
    返回订单基本信息(订单号 / 状态 / 金额 / 创建时间)。
    不返回明细(用 get_order_detail);不支持模糊用户姓名(用 search_users)。
    例:query='ORDER-2026' 找今年订单;query='user@x.com' 找用户的订单。"""
```

description 要回答 LLM 的三个问题:

1. **能干什么**(查什么)
2. **不能干什么**(避免误用)
3. **有什么例子**(LLM 看示例最快)

### 5.2 input schema 严格

```python
@mcp.tool()
def transfer_money(
    from_account: str,           # FastMCP 自动从签名生成 schema
    to_account: str,
    amount: float,
    currency: str = "USD",
    confirm: bool = False,
) -> dict:
    """转账。**破坏性,需 confirm=True 才执行;否则只 dry_run**。"""
    ...
```

更严格的可以用 pydantic:

```python
from pydantic import BaseModel, Field

class TransferInput(BaseModel):
    from_account: str = Field(..., min_length=10)
    to_account: str = Field(..., min_length=10)
    amount: float = Field(..., gt=0, le=10000)
    currency: str = Field("USD", pattern="^[A-Z]{3}$")
    confirm: bool = False

@mcp.tool()
def transfer(input: TransferInput) -> dict:
    """..."""
```

### 5.3 返回值结构化

```python
return {
    "content": [
        {"type": "text", "text": "..."}
    ]
}
```

或带图:

```python
return {
    "content": [
        {"type": "text", "text": "图表如下"},
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": ...}}
    ]
}
```

### 5.4 错误处理

```python
@mcp.tool()
def get_user(user_id: str):
    """..."""
    user = db.find(user_id)
    if not user:
        return {
            "content": [{"type": "text", "text": f"user {user_id} not found"}],
            "isError": True,
        }
    return ...
```

`isError: true` 让 LLM 知道这是失败,**不要继续基于错误推理**。

---

## 六、stdio 调试的几个铁律

stdio 是默认通道——但**调试有坑**:

### 6.1 别 print 调试

任何 stdout 输出**直接污染 JSON-RPC 协议**,Claude Code 一头雾水。

```python
# 错
print("debug log")   # 进 stdout 破坏协议

# 对
import sys
print("debug log", file=sys.stderr)
# 或 logging 到文件
import logging
logging.basicConfig(filename="/tmp/mcp.log", level=logging.DEBUG)
```

### 6.2 异常要返回 isError,别 raise 出协议层

```python
@mcp.tool()
def risky():
    try:
        do_stuff()
    except Exception as e:
        return {"content": [{"type": "text", "text": str(e)}], "isError": True}
```

未捕获的异常会让 server 崩,Claude Code 看到 connection lost。

### 6.3 一次返回别太大

LLM 看到 50K token 的 tool result 直接撑爆 context。**自己分页 / 截断**:

```python
@mcp.tool()
def list_orders(limit: int = 50):
    """list orders, default 50, max 200."""
    limit = min(limit, 200)
    rows = db.orders.list(limit=limit)
    return f"{len(rows)} orders:\n" + "\n".join(format_order(r) for r in rows)
```

### 6.4 stdio 是同步阻塞

跑 30 秒的查询会让整个 session 等 30 秒。**长任务**:

- 拆"启动 + 查询状态"两个 tool
- 或用 Streamable HTTP(支持流式 progress notifications)
- 或后台跑(返回 task_id,LLM 之后查)

---

## 七、Resources(只读数据)

不只是 tools,server 还能暴露 resources(LLM 不主动调,Host 帮注入):

```python
@mcp.resource("user://info/{user_id}")
def user_resource(user_id: str) -> str:
    user = db.find(user_id)
    return f"姓名:{user.name}\n邮箱:{user.email}\n注册:{user.created_at}"
```

Claude Code 用户可以在 UI 里把 `user://info/abc-123` 拉到对话里,LLM 直接看到内容,**不需要调 get_user_info tool**。

> Resources 在 RAG / 知识库 / 上下文注入场景比 tools 更合适——**不消耗 LLM 决策预算**。

---

## 八、Prompts(预定义模板)

server 可以暴露 prompts(Slash command 风格的快捷指令):

```python
@mcp.prompt()
def code_review(code: str) -> list:
    """审查代码,返回标准格式 prompt。"""
    return [
        {"role": "user", "content": f"请审查代码:\n```\n{code}\n```\n按以下维度..."}
    ]
```

Claude Code 用户可以在 UI 里调出 prompts list 选择 `/code_review`,Claude Code 就把这个 prompt 注入对话。

> Prompts 用得不多,但对**SaaS 化的 MCP server**(像 Notion 官方 server)很好用——把 SaaS 自家的"标准查询模板"打包进去。

---

## 九、本地起步:一个完整有用的 server 例子

写一个"个人 wiki" MCP server。Markdown 笔记按文件夹存,server 提供 search / read / create 三个 tool。

```python
# wiki_server.py
from pathlib import Path
from mcp.server.fastmcp import FastMCP

WIKI = Path.home() / "wiki"
mcp = FastMCP("personal-wiki")

@mcp.tool()
def list_notes(folder: str = "") -> str:
    """列出某文件夹下的笔记(默认根目录)。返回路径列表。"""
    base = WIKI / folder
    if not base.is_dir():
        return f"{folder} 不存在"
    files = sorted(p.relative_to(WIKI) for p in base.rglob("*.md"))
    return "\n".join(str(f) for f in files)

@mcp.tool()
def read_note(path: str) -> str:
    """读一个笔记的内容(相对 wiki 根目录路径)。"""
    p = WIKI / path
    if not p.is_file():
        return f"{path} 不存在"
    return p.read_text(encoding="utf-8")

@mcp.tool()
def search_notes(query: str, limit: int = 20) -> str:
    """按关键词搜笔记内容(简单 grep)。"""
    hits = []
    for p in WIKI.rglob("*.md"):
        try:
            text = p.read_text(encoding="utf-8")
        except: continue
        if query.lower() in text.lower():
            hits.append(str(p.relative_to(WIKI)))
            if len(hits) >= limit: break
    return "\n".join(hits) or "无匹配"

@mcp.tool()
def create_note(path: str, content: str, overwrite: bool = False) -> str:
    """创建一个新笔记。overwrite=False 时若文件存在会拒绝。"""
    p = WIKI / path
    if p.exists() and not overwrite:
        return f"{path} 已存在,用 overwrite=True 覆盖"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return f"已写入 {path}"

if __name__ == "__main__":
    mcp.run()
```

接进 Claude Code:

```bash
claude mcp add wiki -- python /path/to/wiki_server.py
```

之后你在 Claude Code 里说"找一下我对 zustand 的笔记 → 把 React 那章的关键点总结到一个新笔记里",**Claude 自动调三个 tool 完成**。

---

## 十、踩坑

1. **stdout print 调试**——破坏协议,Claude Code 失联;**stderr 或日志文件**
2. **未捕获异常**——server 崩,session 断;**所有 tool 都 try-except 返回 isError**
3. **description 写"它是什么"**——LLM 要的是"何时用我";**写场景 + 例子**
4. **input schema 太松**——`Any` 类型让 LLM 乱填,业务校验失败
5. **返回值过大**——50K 文本撑爆 context;**主动分页**
6. **同步阻塞长任务**——session 等 30 秒;**拆 start/poll**
7. **没本地测试就放生产**——inspector 都不开,直接接 Claude Code 看效果,慢
8. **stdio 路径写相对路径**——cwd 不一致 server 起不来;**用绝对路径**
9. **token / API key 硬编码**——server 代码里写死,别人没法用;**通过 env 注入**
10. **不写 README + 安装命令**——别人接进来不知道怎么配 env / 怎么跑

---

下一篇:`25-实战内部MCP-server.md`,把这套放大——给公司内部部署平台 / 监控 / 工单系统 写一套真实可用的 MCP server,讲架构 / 鉴权 / 审计 / 灰度发布。
