# MCP 进阶:Resources / Prompts / Streaming / Sampling

24-26 篇大量篇幅花在 tools——MCP 三大原语里实战最常用的一个。但 Resources、Prompts、Streaming progress、Sampling 这几个"非 tool"原语其实在很多场景比 tool 更合适,只是新写 server 的人很少接触。这一篇把它们补完。

> 一句话先记住:**Resources = 只读数据资源,LLM 不主动调,Host 帮注入;Prompts = 预定义指令模板,user 触发;Streaming progress = 长任务进度通知;Sampling = server 反向调 LLM**。掌握了它们,你的 MCP server 表达力翻倍。

---

## 一、Resources:为什么不只是"另一个 tool"

回顾 tool 的工作模式:

```
LLM 决定调 tool → server 执行 → 返回结果 → 进 LLM context
```

每次都消耗 LLM 的"我要调谁"的决策预算 + token。

Resources 不一样:

```
User 在 Host UI 里把 resource X 拉进对话(显式选择)
    ↓
Host 自动把 resource X 内容注入 LLM context
    ↓
LLM 直接看到内容(不用调 tool)
```

**两个核心差别**:

1. **谁触发**:tool 是 LLM 自己,resource 是用户(或 Host 智能注入)
2. **资源用法**:tool 是动作,resource 是上下文

> 一条 rule of thumb:**"用户/Host 显式选择想看的数据" 用 resource;"LLM 自己决定要不要查的能力"用 tool**。

---

## 二、什么场景适合 Resource

### 2.1 配置文件 / API spec

```python
@mcp.resource("apispec://service/{name}")
def fetch_spec(name: str) -> str:
    return openapi_client.fetch(name).raw_yaml
```

工程师把 `apispec://service/payment` 拉进对话,LLM 直接看到 OpenAPI,**不用调 tool**。

### 2.2 文件浏览器

```python
@mcp.resource("file:///{path}")
def fetch_file(path: str) -> str:
    return Path(path).read_text()
```

文件系统 server 通常用 resources 暴露目录树 / 文件内容。

### 2.3 设计稿 / 截图

```python
@mcp.resource("figma://node/{id}")
def fetch_figma_node(id: str) -> dict:
    node = figma.fetch(id)
    return {"contents": [
        {"type": "image", "data": node.png_base64, "mimeType": "image/png"}
    ]}
```

### 2.4 数据库 schema

```python
@mcp.resource("schema://table/{table}")
def fetch_schema(table: str) -> str:
    return db.describe(table)
```

User 把多个 table schema 拉进对话,LLM 写 join SQL 就有依据。

---

## 三、写 Resource 的 SDK 用法

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("docs")

# 静态 URI
@mcp.resource("doc://intro")
def intro() -> str:
    return "我们公司..."

# 模板 URI
@mcp.resource("doc://{slug}")
def get_doc(slug: str) -> str:
    return wiki.fetch(slug)

# 列出可用资源(给 Host UI 展示用)
@mcp.list_resources()
def list_all() -> list:
    return [
        {"uri": "doc://intro", "name": "介绍"},
        {"uri": "doc://guidelines", "name": "工程规范"},
    ]
```

Host(Claude Code / Cursor)会调 `list_resources` 拿到清单,在 UI 里给用户选;用户选了 → Host 调对应 resource → 把内容注入 prompt。

---

## 四、Resource 的高阶用法

### 4.1 订阅(subscribe)

某些 resource 内容会变。Host 可以"订阅"——server 主动通知 resource 更新:

```python
@mcp.resource("monitor://service/{name}")
def monitor_service(name: str) -> dict:
    return {"contents": [{"text": fetch_metrics(name)}]}

# 内部定期 push 更新
async def watch():
    while True:
        for sub in subscribed:
            await mcp.send_resource_update(sub)
        await asyncio.sleep(10)
```

Host 收到通知,可以重新拉 resource。**实时监控场景**用得到。

### 4.2 多 mime type

resource 不只是文本,可以图、可以二进制:

```python
@mcp.resource("chart://daily")
def daily_chart():
    img = render_chart()
    return {"contents": [{"type": "image", "data": img_b64, "mimeType": "image/png"}]}
```

---

## 五、Prompts:可触发的指令模板

Prompts 是 server 暴露的"slash command 风格快捷指令":

```python
@mcp.prompt()
def code_review(language: str, code: str) -> list:
    """审查代码的标准 prompt。"""
    return [
        {"role": "user", "content": f"请审查以下 {language} 代码:\n```\n{code}\n```\n按以下维度..."}
    ]

@mcp.prompt()
def jql_query(natural_query: str) -> list:
    """把自然语言转成 Jira JQL。"""
    return [
        {"role": "user", "content": f"把这个查询写成 JQL:\n{natural_query}"}
    ]
```

Host 在 UI 里展示这些 prompts(slash 风格);用户点选 → Host 注入 prompt → LLM 处理。

**典型用法**:

- SaaS 自家的"标准查询模板"(GitHub 的 review prompt、Linear 的 status update prompt)
- 团队规范化的 prompt(commit message 风格、测试用例风格)

> Prompts 用得不多,但很合适 SaaS 化场景。**官方 server 经常带,自写 server 视情况**。

---

## 六、Streaming Progress:长任务进度通知

stdio MCP 是同步阻塞——LLM 调 30 秒的 tool,session 等 30 秒。但 MCP 协议支持 progress notifications:

```python
@mcp.tool()
async def long_task(item_count: int, ctx) -> str:
    """跑一个会持续几分钟的任务,带进度通知。"""
    for i in range(item_count):
        do_work(i)
        # 推进度给 host(host 可能转发给 LLM 或显示给用户)
        await ctx.report_progress(progress=i + 1, total=item_count)
    return f"完成 {item_count} 个"
```

Host 收到 progress 后:

- 在 UI 显示进度条
- 决定是否让 LLM 继续等
- 必要时 cancel

**适合**:

- 长任务(> 10 秒)
- 批处理(明显有"已完成/总数")
- 调用云服务异步任务(轮询状态时推进度)

---

## 七、Sampling:Server 反向调 LLM

**Sampling 是 MCP 里最容易被忽略也最强的特性**。

普通流程:LLM → server tool → 数据 → LLM。

Sampling:**server 在 tool 内部反过来调 LLM** 一次,让 LLM 帮 server 完成某个推理任务,再继续 tool 流程。

```python
@mcp.tool()
async def smart_summarize(article: str, ctx) -> str:
    """智能总结文章,server 反过来调 LLM 做总结。"""
    response = await ctx.sampling.create_message(
        messages=[{"role": "user", "content": f"100 字总结:\n{article}"}],
        max_tokens=200,
    )
    return response.content[0].text
```

为什么需要这个?

- Server 自己**不持有 LLM API key**——通过 Host 借 LLM 调用,不需要自己付费
- 同一个 LLM(用户当前的)做"嵌套推理",成本归用户
- Server 写 RAG / 智能摘要 / 智能分类 这种"server 内部需要 LLM"的逻辑

**典型例子**:

- 一个 Notion server 的 search tool 不只是关键词匹配,内部调 LLM 做语义重排
- 一个 wiki server 的 summarize tool 把命中的多个文档让 LLM 二次总结
- 一个 SQL server 的 query tool 让 LLM 改写 query 优化

> Sampling 是 MCP 协议里**最少人用但最强大**的能力。让你的 server 自带"AI 能力",而不是只是"接口的 mcp 包装"。

---

## 八、综合例子:一个智能内部 wiki server

把 resources / prompts / sampling 全用上:

```python
@mcp.resource("wiki://page/{slug}")
def get_page(slug: str) -> str:
    """单页内容(用户可拉进对话)。"""
    return wiki.fetch(slug).content

@mcp.resource("wiki://list")
def list_pages() -> str:
    """所有页面列表,用户可浏览选择。"""
    return "\n".join(f"{p.slug}: {p.title}" for p in wiki.all())

@mcp.prompt()
def find_answer(question: str) -> list:
    """触发"用 wiki 回答问题"标准 prompt。"""
    return [
        {"role": "user", "content": f"在公司 wiki 里找答案:{question}\n用 search_wiki 找,然后总结"}
    ]

@mcp.tool()
async def search_wiki(query: str, smart_rerank: bool = True, ctx) -> str:
    """搜公司 wiki。smart_rerank=True 时 LLM 帮重排相关性。"""
    candidates = wiki.bm25_search(query, top=20)
    if not smart_rerank:
        return "\n".join(format_hit(c) for c in candidates[:5])

    # Sampling: 让 LLM 重排
    rerank_prompt = f"问题: {query}\n候选:\n" + "\n".join(
        f"{i}. {c.title}\n{c.excerpt}" for i, c in enumerate(candidates)
    ) + "\n按相关性返回前 5 个的编号(逗号分隔)"
    resp = await ctx.sampling.create_message(
        messages=[{"role": "user", "content": rerank_prompt}],
        max_tokens=50,
    )
    indices = parse_indices(resp.content[0].text)
    return "\n".join(format_hit(candidates[i]) for i in indices[:5])
```

这个 server 给团队的体验:

- **主动浏览 wiki**:UI 里看 `wiki://list` 选页面拉进对话
- **快捷问答**:`/find_answer` 触发标准查询 prompt
- **智能搜索**:LLM 调 search_wiki,结果是经过 LLM 重排的相关性排序

---

## 九、Host 端如何使用这些原语(用户视角)

| 原语 | Claude Code 体验 |
| --- | --- |
| **Tool** | LLM 自动调,你看到 `mcp__server__tool_name` 调用 |
| **Resource** | `/mcp` 里看到资源列表,你选"加进对话" |
| **Prompt** | `/mcp` 里看到 prompt 列表,你选触发 |
| **Streaming progress** | UI 进度条 / 更新提示 |
| **Sampling** | 你不直接看到,server 内部用了 |

> Claude Code 对 resource 和 prompt 的 UI 还在持续完善中。**写 server 时三种原语都暴露,Host UI 演进时自动用上**。

---

## 十、踩坑

1. **什么都做成 tool**——resource / prompt 适合的场景硬塞 tool,LLM 决策预算被消耗
2. **Resource URI 设计混乱**——一会儿 `wiki://`,一会儿 `internal://`,Host UI 难显示;**风格统一**
3. **大 resource 一次返回**——10MB 的 resource 直接撑爆 context;**分段或分页**
4. **subscription 不清理**——客户端断了 server 还推,内存涨;**心跳超时清**
5. **Sampling 滥用**——简单逻辑也调 LLM,贵又慢;**只在真需要 AI 推理时用**
6. **Sampling 不限制**——server 内部 LLM 调用让 user 付钱,可能恶意 server 调爆 user 配额;**Host 应该有限流**
7. **Prompt 写得太死**——只有写死的几个变量;**留出灵活字段**
8. **不写 list_resources**——Host UI 没法发现你的 resources
9. **Progress 不发**——长任务用户以为卡死了
10. **以为 sampling 让 server 拿到模型 key**——不是,sampling 是 server 通过 Host 借调,Host 在中间;**server 不持有 API key 是它的特点**

---

## 十一、第四层(MCP server 开发)结束语

24-27 篇讲完了 MCP server 开发的全部内容:

```
24 入门         FastMCP / TS SDK / 基本 tool
25 内部场景      企业部署 server 完整范例
26 安全与远程    OAuth / streamable HTTP / 审计
27 进阶原语      Resources / Prompts / Streaming / Sampling
```

到这里你能写各种规模的 MCP server——个人小工具、内部企业服务、SaaS 化产品。

下一段(28-30)是收尾:把前 27 篇所有概念串起来讲设计模式与生产化:**怎么选层(slash / hook / skill / subagent / MCP)**、**Agent 设计模式**、**团队 / 生产 / 监控**。
