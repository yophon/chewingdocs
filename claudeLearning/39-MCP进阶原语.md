# MCP 进阶原语

36-38 篇几乎只讲了工具,因为工具是模型能主动使用的唯一一种能力,也是绝大多数 server 的主体。但 MCP 还有一整套别的东西:让应用把数据放进上下文的 resources,让用户一键触发流程的 prompts,让工具在执行中途向用户要信息的 elicitation,进度、取消、变更通知,以及 MCP Apps 这类扩展。用好它们,server 会和宿主应用结合得更紧密。

2026-07-28 修订对这一部分改动最大,网上很多教程已经过时。这一篇按当前的协议和 SDK v2 来讲。

> 一句话先记住:**新协议里,server 不再主动向客户端发请求**。凡是"server 需要客户端帮忙"的事——问用户、让客户端的模型生成内容、列出客户端的目录——都改成了**返回一个"还需要什么"的结果,让客户端补齐后重试原请求**。这个模式叫 MRTR(多轮请求),理解了它,elicitation 等能力的新形态就都清楚了。

---

## 一、全景

| 能力 | 方向 | 2026-07-28 的状态 | Claude Code 里 |
| --- | --- | --- | --- |
| Tools | 客户端 → server | 核心 | Claude 自己调用 |
| Resources / 资源模板 | 客户端 → server | 核心 | `@server:uri` 引用;Claude 也有列出、读取资源的工具 |
| Prompts | 客户端 → server | 核心 | `/server:prompt` 命令 |
| 参数补全 | 客户端 → server | 核心 | — |
| Elicitation | server 要用户输入 | 核心,**改为 MRTR 承载** | 弹出表单或询问是否打开链接 |
| 进度 / 取消 | 双向的工具函数 | 核心 | — |
| 变更通知 | server → 客户端 | 改为统一的 `subscriptions/listen` | 自动刷新工具列表 |
| Sampling | server 用客户端的模型 | **已弃用** | — |
| Roots | server 读客户端的目录 | **已弃用** | 用 `CLAUDE_PROJECT_DIR` 环境变量代替 |
| 协议级日志 | server → 客户端 | **已弃用** | — |
| `ping` | — | **已移除** | — |
| 扩展(Apps、Skills、Tasks) | — | 通过 `extensions` 能力声明 | Apps 在 Claude Desktop、claude.ai 里渲染 |

---

## 二、Resources

### 2.1 静态资源和资源模板

```python
from mcp.server import MCPServer

mcp = MCPServer("acme-support")

@mcp.resource("policy://refund")
def refund_policy() -> str:
    """当前生效的退款政策全文。"""
    return load_policy("refund")

@mcp.resource("ticket://{ticket_id}", mime_type="application/json")
def ticket(ticket_id: str) -> dict:
    """一张工单的完整内容,包括所有回复。"""
    return fetch_ticket(ticket_id)
```

- URI 里没有占位符的是**静态资源**,出现在 `resources/list` 里;有 `{占位符}` 的是**资源模板**,出现在 `resources/templates/list` 里,一个函数服务所有匹配的 URI
- 返回 `str` 是文本,`bytes` 是 base64 二进制,其他类型序列化成 JSON 文本。`mime_type` 要自己声明,默认 `text/plain`,SDK 不会根据返回值猜
- Python SDK v2 的模板是真正的 RFC 6570(支持 `{+path}`、`{?query}`),匹配是精确的,**提取出的值里的路径穿越默认会被拒绝**

### 2.2 什么时候用资源,什么时候用工具

| 用资源 | 用工具 |
| --- | --- |
| 内容是"读"出来的,没有副作用 | 有副作用,或者需要计算 |
| 用户想把它明确地放进对话(`@ticket://T-881`) | 模型需要自己决定什么时候去拿 |
| 文档、配置、schema、政策这类参考材料 | 搜索、过滤、聚合 |

两者不冲突:很多 server 同时提供 `get_ticket` 工具和 `ticket://{id}` 资源,前者给模型用,后者给用户 `@` 引用。

### 2.3 缓存提示

新协议要求列表类和读取类结果带两个字段:`ttlMs`(多久内可以认为结果还新鲜)和 `cacheScope`(`public` 或 `private`,共享的中间层能不能缓存)。客户端据此缓存结果、减少轮询。Python SDK 用 `MCPServer(cache_hints=...)` 按方法设置。按用户返回不同内容的资源,`cacheScope` 一定要是 `private`。

---

## 三、Prompts

```python
@mcp.prompt()
def triage_ticket(ticket_id: str, tone: str = "正式") -> str:
    """按标准流程分析一张工单,给出处理建议和回复草稿。"""
    return (f"请处理工单 {ticket_id}:读工单和客户概况,对照 policy://refund 判断是否需要退款,"
            f"给出处理建议,并用{tone}的语气起草一封回复。不要直接执行退款。")
```

- prompt 的参数是**一组带名字的字符串**,没有 JSON Schema——它是给人填的表单,不是给模型构造的数据
- 返回 `str` 就是一条 user 消息;返回消息列表可以预置一段多轮对话
- 在 Claude Code 里显示为 `/acme-support:triage_ticket (MCP)`,也可以直接输入 `/mcp__acme-support__triage_ticket T-881`
- 客户端可以调用**参数补全**,在用户输入 prompt 参数或资源模板变量时给出候选值(比如工单号),server 实现 `completion/complete` 即可

prompts 在团队里的价值,是把"老员工的处理流程"变成每个人都能一键运行的命令。和 Claude Code 自己的 skills(10 篇)相比,MCP prompt 的好处是跟着 server 走,任何 MCP 客户端都能用;坏处是只能生成消息,不能像 skill 那样附带脚本和多个文件。

---

## 四、多轮请求(MRTR)

### 4.1 以前和现在

以前,工具执行到一半需要用户确认时,server 会**反过来**向客户端发一个 `elicitation/create` 请求,等用户回答后继续执行。这要求 server 和客户端之间有一条持续的双向通道——这正是新协议去掉会话之后不再有的东西。

现在的做法是**返回,而不是回调**:

```
客户端 ── tools/call refund(order=ORD-1, amount=120) ──→ server
        ←── InputRequiredResult:
              input_requests = { "confirm": 一个 elicitation 表单 }
              request_state  = <加密的中间状态>
客户端 ── 把表单展示给用户,拿到回答
客户端 ── tools/call refund(同样的参数, input_responses={"confirm": 回答}, request_state=原样带回) ──→ server
        ←── CallToolResult:已退款
```

- 每一步都是客户端发给 server 的普通请求,没有反方向的流量,任何实例都能处理(38 篇)
- `input_requests` 是一个字典,值可以是 elicitation、sampling 或 roots 请求,键由 server 起名;客户端在重试时把回答放在**同一个键**下
- `request_state` 是 server 签发的不透明令牌,客户端原样带回。重试是同一个工具、同样的参数,而不是一个新方法
- 所有结果现在都带 `resultType`:普通结果是 `complete`,中间结果是 `input_required`
- 不只是工具:`prompts/get` 和资源模板的 `resources/read` 也可以这样返回

### 4.2 Python:用 `Resolve` + `Elicit`

37 篇介绍过 `Resolve`:一个参数由你写的函数提供,模型看不到它。这个函数可以返回 `Elicit(...)` 来向用户提问:

```python
from typing import Annotated
from pydantic import BaseModel, Field
from mcp.server.mcpserver import Elicit, Resolve

class Confirm(BaseModel):
    ok: bool = Field(description="确认执行这笔退款?")

async def confirm_large_refund(order_id: str, amount_cents: int) -> Confirm | Elicit[Confirm]:
    if amount_cents < 10_000:
        return Confirm(ok=True)                                   # 小额不用问
    return Elicit(f"订单 {order_id} 将退款 {amount_cents / 100:.2f} 元,确认吗?", Confirm)

@mcp.tool()
async def refund(
    order_id: str,
    amount_cents: int,
    confirm: Annotated[Confirm, Resolve(confirm_large_refund)],
) -> str:
    """为订单退款。大额退款会先请用户确认。"""
    if not confirm.ok:
        return "用户取消了退款。"
    ...
```

**这是推荐的写法**,因为它对两个协议时代都适用:新协议的客户端走 MRTR,老协议的客户端走原来的推送式 elicitation,SDK 自动处理。相比之下:

- `ctx.elicit()` 是旧的推送方式,在新协议的连接上会抛 `NoBackChannelError`
- 手动返回 `InputRequiredResult` 能完全控制每一轮,但在老协议的会话上返回它会报错

升级到 v2 后,这是唯一一处会**悄悄改变行为**的地方:在 v1 上能通过的、用了 `ctx.elicit()` 的测试,在 v2 上会失败,因为测试用的 `Client(mcp)` 默认协商新协议。

### 4.3 TypeScript

```typescript
import { inputRequired, acceptedContent } from "@modelcontextprotocol/server";

const confirmSchema = z.object({ confirm: z.boolean().meta({ title: "确认部署" }) });

server.registerTool(
  "deploy",
  { description: "部署到指定环境,需要操作者确认", inputSchema: z.object({ env: z.string() }) },
  async ({ env }, ctx) => {
    const answer = acceptedContent(ctx.mcpReq.inputResponses, "confirm", confirmSchema);
    if (answer?.confirm !== true) {
      return inputRequired({
        inputRequests: { confirm: inputRequired.elicit({ message: `部署到 ${env}?`, requestedSchema: confirmSchema }) },
      });
    }
    return { content: [{ type: "text", text: `已部署到 ${env}` }] };
  },
);
```

`ctx.mcpReq.inputResponses` 来自客户端,要当作不可信输入;`acceptedContent` 的第三个参数是校验用的 schema。旧的 `ctx.mcpReq.elicitInput` 在新协议的请求上会抛错。

### 4.4 `request_state` 的安全

客户端在两轮之间保管 `request_state`,所以它回来时是**客户端提供的输入**,可能被篡改、重放或过期。Python SDK 默认会加密签名它,并绑定:有效期(默认每轮 600 秒)、调用者身份(有 OAuth token 时)、原请求(方法、工具名、参数摘要)、问过的问题(改了问题的措辞,就会重新问而不是复用旧答案)。多实例部署要共享密钥(38 篇)。

---

## 五、Elicitation

### 5.1 两种模式

| 模式 | 是什么 | 用于 |
| --- | --- | --- |
| **表单** | server 给出一个扁平的 schema(字符串、数字、布尔、枚举),客户端渲染成表单 | 确认、选择、补充非敏感的参数 |
| **URL** | server 给出一个链接,用户在浏览器里完成操作 | 登录第三方服务、支付、输入 API key 这类敏感操作 |

用户的回答有三种:`accept`(提交了)、`decline`(明确拒绝)、`cancel`(关掉了,没有表态)。三种都要处理。

### 5.2 规则

- **不能用表单模式索要密码、API key、access token、支付凭据**——表单内容会经过客户端,可能进入模型上下文和日志。这些用 URL 模式,让用户在你的网页上直接输入
- 第三方服务的凭据**不能经过 MCP 客户端**
- URL 模式是用来授权**第三方服务**的,不能拿它代替 MCP server 自己的认证(那是 38 篇的 OAuth)
- 2026-07-28 删掉了 URL 模式里的 `elicitationId` 和"完成"通知:客户端通过重试原请求得知结果,server 需要关联时自己在 `request_state` 里记一个标识

### 5.3 在 Claude Code 里

表单模式弹出一个对话框;URL 模式询问用户是否在浏览器中打开链接。在新协议的连接上,Claude Code 声明同时支持两种模式。无人值守时可以用 `Elicitation` hook 自动回应(11 篇)。

---

## 六、进度、取消与日志

```python
@mcp.tool()
async def import_catalog(urls: list[str], ctx: Context) -> str:
    """从一组 URL 导入书目记录。"""
    for i, url in enumerate(urls, start=1):
        await import_one(url)
        await ctx.report_progress(i, total=len(urls), message=f"已导入 {url}")
    return f"导入了 {len(urls)} 条记录"
```

- **进度**通知只能从 server 发往客户端,走的是这个请求自己的响应流
- **取消**:客户端可以取消一个进行中的请求,长时间运行的工具应该响应取消、及时停下
- **协议级日志**(`ctx.info()` 这类,`notifications/message`)已弃用。stdio server 写 stderr,远程 server 用 OpenTelemetry(Python SDK v2 默认带了 OTel 中间件)。日志级别改为每个请求在 `_meta` 里单独指定,`logging/setLevel` 已移除

---

## 七、变更通知

server 提供的工具、prompts、资源列表可以在运行中变化,比如用户权限变了、新接入了一个系统。新协议把所有变更通知统一到一个 `subscriptions/listen` 长连接上,客户端声明自己关心哪几类:工具列表变化、prompt 列表变化、资源列表变化、某个资源的内容变化。

```python
await ctx.notify_resource_updated("ticket://T-881")      # 某张工单有了新回复
```

Claude Code 在交互会话里收到列表变化会自动重新拉取,不用重连;在 `-p` 模式和 Agent SDK 里只刷新工具列表。部署到 serverless 平台时这条长连接经常被断开,Claude Code 会有限次地重连,所以**不要依赖通知做关键逻辑**,结果里的 `ttlMs` 是更可靠的刷新依据。

---

## 八、扩展

新协议给客户端和 server 的能力声明都加了 `extensions` 字段,可选的功能以反向域名命名的扩展形式提供,不再塞进核心协议。

### 8.1 MCP Apps

一个"带界面的工具":工具照常返回数据,同时通过 `_meta.ui.resourceUri` 指向一个 `ui://` 资源,里面是一份 HTML。宿主读取这份 HTML,放进**沙箱 iframe** 渲染,再用 `postMessage` 把工具结果推给它。

```python
from mcp.server.apps import Apps

apps = Apps()

@apps.tool(resource_uri="ui://orders/timeline.html")
def order_timeline(order_id: str) -> dict:
    """订单的物流时间线。"""
    return get_timeline(order_id)

apps.add_html_resource("ui://orders/timeline.html", TIMELINE_HTML)   # MIME 为 text/html;profile=mcp-app
mcp = MCPServer("acme-support", extensions=[apps])
```

- HTML 里用官方的 `@modelcontextprotocol/ext-apps` 浏览器 SDK 接收结果、回调工具
- Claude Desktop 和 claude.ai 会把它渲染成对话里的交互组件;**Claude Code 终端里不显示**,`ui://` 资源也不会出现在 `@` 补全里
- 规范要求:**即使有界面,工具也必须返回有意义的 `content`**。不渲染界面的客户端(包括 Claude Code)只能看到它

### 8.2 Skills

一个约定:把 Agent Skills(10 篇讲的 `SKILL.md` 加配套文件)作为 `skill://` 资源通过 MCP 提供,客户端用 `skills/list`、`skills/get` 发现和读取。这样团队的操作规范可以跟着 server 一起分发,不用每个人往本地复制。Python SDK v2 内置了这个扩展的协议部分,内容从哪里来由你决定。

### 8.3 Tasks

长时间运行的操作(生成一份大报告、跑一次数据迁移)不适合让一个请求一直挂着。原来实验性的 tasks 功能被移出核心协议,改成官方扩展:server 返回一个任务句柄,客户端用 `tasks/get` 轮询状态。Python SDK v2 暂时还没有实现这个扩展。

### 8.4 请求头参数

新协议要求 HTTP 请求带 `Mcp-Method`、`Mcp-Name` 头,网关不用解析请求体就能路由。工具 schema 里标了 `x-mcp-header` 的参数会被复制到 `Mcp-Param-*` 请求头,server 会交叉校验——这让网关可以按租户 ID 之类的参数做路由和限流。

---

## 九、已弃用的:Roots、Sampling

| 功能 | 原来的用途 | 迁移方式 |
| --- | --- | --- |
| **Roots** | server 询问客户端"用户在操作哪些目录" | 通过工具参数、资源 URI 或 server 配置传入目录。Claude Code 启动 stdio server 时会设置 `CLAUDE_PROJECT_DIR` |
| **Sampling** | server 借用客户端的模型生成内容 | server 直接调用模型 API(比如用 Claude API) |
| **协议级日志** | server 把日志发给客户端显示 | stderr 或 OpenTelemetry |

弃用意味着功能仍然可用,但新实现不要再加;最早会在 2027-07-28 之后的修订中移除。sampling 被弃用的原因很实际:让 server 借用客户端的模型,意味着 server 的行为取决于用户用的是什么模型、什么配额,还要处理用户审批,支持它的客户端也一直很少。需要模型能力的 server,直接集成模型 API 更可控。

---

## 十、怎么选

| 需求 | 用什么 |
| --- | --- |
| 模型需要执行一个动作 | Tool |
| 用户想把某份参考材料放进对话 | Resource |
| 一类对象可以按 ID 引用 | 资源模板 |
| 团队的标准流程想一键运行 | Prompt(复杂的、需要脚本的用 skill) |
| 工具执行中途需要用户确认或补充信息 | `Resolve` + `Elicit`(新老协议都适用) |
| 需要用户在第三方网站登录或输入凭据 | URL 模式的 elicitation |
| 长时间运行的工具 | 进度通知 + 响应取消;更长的考虑 tasks 扩展 |
| 工具结果适合用图表、表单展示 | MCP Apps,同时保证文本 `content` 完整 |
| 想让 server 的工具列表随权限变化 | 变更通知 + 合理的 `ttlMs` |

---

## 十一、踩坑

1. **照旧教程在工具里 `await ctx.elicit(...)`**——新协议连接上会抛 `NoBackChannelError`,改用 `Resolve` + `Elicit`
2. **用表单模式要用户的 API key**——规范禁止,敏感信息用 URL 模式
3. **只处理了 `accept`**——`decline` 和 `cancel` 也会发生,而且含义不同
4. **相信重试时带回来的 `input_responses`**——它来自客户端,要校验
5. **多实例部署时多轮工具偶尔失败**——`request_state` 的密钥没有共享
6. **资源不声明 `mime_type`**——一律被当成纯文本
7. **按用户返回不同内容的资源用了 `public` 缓存范围**——共享的中间层可能把一个人的数据给另一个人
8. **MCP App 的工具只返回界面,`content` 是空的**——Claude Code 等不渲染界面的客户端什么都看不到
9. **新写的 server 还在用 sampling 和 roots**——已弃用,直接调模型 API、用参数或配置传目录
10. **用协议级日志做排查**——已弃用,写 stderr 或接 OpenTelemetry

---

到这里,第六层「MCP Server 开发」结束了。这一层从使用者换到了作者的位置:2026 年协议的变化和当前的 SDK,企业内部 server 怎么按任务设计、怎么复用已有的权限和审计,远程部署和 MCP 特有的安全威胁,最后是工具之外的那些原语。一个好的 MCP server,是把公司的系统以模型能理解、人能控制的方式开放出来。

最后一层回到更高的视角:Claude 生态里有这么多扩展方式——CLAUDE.md、skills、hooks、子 agent、plugins、MCP、Agent SDK、Managed Agents——面对一个具体需求该选哪个,agent 该怎么设计,团队和企业又该怎么落地。

下一篇:`40-扩展机制选型.md`,把前面讲过的所有扩展机制放在一起比较:它们各自解决什么问题、上下文成本如何、作用范围多大,以及一套从需求出发的选型方法。
