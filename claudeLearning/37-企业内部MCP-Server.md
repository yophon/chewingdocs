# 企业内部 MCP Server

36 篇的书店 server 是个玩具:数据在内存里,谁都能调,没有副作用。真实的内部 server 面对的是另一回事:后面是订单系统、工单系统、CRM,有的工具会退款、改配置、发通知;调用它的是公司里不同角色的员工,每个人能看能改的东西不一样;出了问题要能查清楚"谁、在什么时候、让 agent 做了什么"。

这一篇以一个客服运营场景为例,讲怎么把内部系统包装成一个**好用、可控、可审计**的 MCP server。

> 一句话先记住:**MCP server 是一道新的入口,但不应该是一套新的权限系统**。它应该包装公司已有的服务,复用已有的鉴权、业务规则和审计,而不是绕过它们直连数据库。Claude Code 的权限规则只是用户体验层面的护栏,真正的安全边界在 server 和它背后的服务里。

---

## 一、先想清楚谁用、用来干什么

不要从"我们有哪些 API"出发,从"大家想让 Claude 帮忙做什么"出发。比如客服团队:

| 用户想做的事 | 需要的能力 |
| --- | --- |
| "这个客户最近怎么了?" | 客户概况:基本信息、最近订单、未结工单 |
| "帮我看看这张工单,给个处理建议" | 读工单详情和历史;查退款政策 |
| "订单 ORD-1234 到哪了?" | 订单和物流状态 |
| "给这个订单退 50 块运费" | 退款(写操作,要确认) |
| "在工单里记一笔,已经联系过客户" | 给工单加备注(写操作) |

这张表直接决定了工具清单。**第一版从三到八个工具开始**,看实际使用情况再加。工具越多,模型选错的概率越高,定义占的上下文也越多。

---

## 二、架构:包装已有服务,不要直连数据库

```
Claude Code / Agent SDK / Managed Agents
        │  MCP(stdio 或 Streamable HTTP)
        ▼
  acme-support MCP server          ← 薄的一层:工具定义、参数校验、结果裁剪、审计
        │  HTTPS + 用户自己的凭据
        ▼
  内部 API 网关 → 订单服务 / 工单服务 / CRM / 支付服务
```

| 做法 | 问题 |
| --- | --- |
| server 直连生产数据库 | 绕过了所有业务规则(退款上限、状态机)和服务层的鉴权;一条写错的 SQL 就是事故 |
| server 用一个超级管理员账号调内部 API | 所有人通过 agent 都拥有了管理员权限;审计日志里只有一个账号 |
| **server 用调用者自己的凭据调内部 API** | 每个人通过 agent 能做的,和他自己在后台系统里能做的完全一样 |

server 本身应该很薄:定义工具、校验参数、把内部 API 的结果裁剪成模型需要的样子、记审计日志。业务逻辑留在原来的服务里。

---

## 三、按任务设计工具

36 篇讲过粒度的原则,在企业场景里更要紧,因为内部 API 往往又多又细:

| 照搬内部 API | 按任务设计 |
| --- | --- |
| `get_customer`、`list_orders_by_customer`、`list_tickets_by_customer`、`get_customer_tags` | `get_customer_overview(customer)`:一次返回基本信息、最近 5 笔订单摘要、未结工单 |
| `get_order`、`get_shipment`、`get_payment` | `get_order_status(order_id)`:订单、支付、物流的摘要 |
| `search(index, query_dsl)` | `search_tickets(query, status, assignee, limit)` |
| `post /refunds` 的所有字段 | `preview_refund` + `create_refund`(见第四节) |

几个在企业里特别有用的做法:

- **接受多种标识**:客户既可以用 ID,也可以用邮箱或手机号查。模型手里往往只有用户随口说的那个
- **结果按模型需要裁剪**:内部 API 返回 80 个字段,工具只返回回答问题需要的十来个;金额统一单位,时间统一时区,状态码翻译成文字
- **在结果里给出下一步**:"未结工单 2 张:T-881、T-902。用 get_ticket 查看详情"
- **列表类工具一律有 `limit` 和过滤条件**,默认值保守

---

## 四、读写分离与危险操作

### 4.1 标注

```python
from mcp.types import ToolAnnotations

READ = ToolAnnotations(read_only_hint=True, open_world_hint=False)
WRITE = ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=True)
DANGER = ToolAnnotations(read_only_hint=False, destructive_hint=True)
```

注解是给客户端的提示,不是强制:Claude Code 会让只读工具并发执行,其他客户端可能据此决定要不要先问用户。

### 4.2 每次都要确认的工具

```python
@mcp.tool(annotations=DANGER, meta={"anthropic/requiresUserInteraction": True})
async def create_refund(...): ...
```

在工具定义的 `_meta` 里声明 `anthropic/requiresUserInteraction: true`,Claude Code 在**任何权限模式下**每次调用都会让用户确认,也不提供"不再询问"(12 篇)。这是 server 作者能施加的、用户的权限设置覆盖不掉的约束。

### 4.3 先预览,再执行

确认框里只显示工具名和参数,用户很难判断"退 5000 是不是太多了"。更好的模式是拆成两步:

```python
@mcp.tool(annotations=READ)
async def preview_refund(order_id: str, amount_cents: int, reason: str, ...) -> RefundPreview:
    """预览一笔退款:检查是否符合退款政策,返回会退给谁、退多少、走哪个渠道,以及一个确认码。
    不会实际退款。确认无误后,用 create_refund 并带上确认码执行。"""

@mcp.tool(annotations=DANGER, meta={"anthropic/requiresUserInteraction": True})
async def create_refund(confirmation_code: str, ...) -> str:
    """执行一笔已经预览过的退款。confirmation_code 来自 preview_refund,10 分钟内有效。"""
```

- 预览阶段做所有校验(政策、上限、订单状态),结果里写清楚后果,模型会把它转述给用户
- 执行只接受预览产生的确认码,确认码绑定了参数和用户,不能被改
- 写操作带**幂等键**:同一个确认码执行两次只退一次。模型重试、网络重放都很常见

### 4.4 让 server 而不是模型提供关键值

有些参数**不应该由模型来填**:当前用户是谁、商品的价格、某个操作需要的审批人。Python SDK v2 的 `Resolve` 让一个参数由你写的函数提供,它不出现在模型看到的 schema 里,模型想传也传不进来:

```python
from typing import Annotated
from mcp.server.mcpserver import Resolve

async def current_user() -> User:
    ...   # 从 OAuth token 或本机凭据解析出调用者,见第五节

@mcp.tool(annotations=WRITE)
async def add_ticket_note(
    ticket_id: str,
    note: str,
    user: Annotated[User, Resolve(current_user)],      # 模型看不到这个参数
) -> str:
    """给工单添加一条内部备注,备注会署上当前用户的名字。"""
```

**模型不能提供的参数,模型就不会填错**——也不会被提示注入篡改。resolver 还可以返回 `Elicit(...)` 向用户提问(比如"这个订单已经退过一次款,确定再退?"),这是新协议下推荐的确认方式,39 篇细讲。

---

## 五、用户身份与权限

server 必须知道"是谁在调用",才能用这个人的权限去访问内部服务。

### 5.1 本地 stdio server

server 是用户自己机器上的一个子进程,**安全边界就是启动它的那个用户**。凭据从用户自己的环境里来,最好的做法是 server 启动时调用公司的登录 CLI 或系统钥匙串,读取本机缓存的、短期有效的凭据:

```python
async def current_user() -> User:
    token = await read_token_from_keychain() or run_cli("acme", "auth", "print-token")
    return User.from_token(token)
```

用 `claude mcp add --env ACME_TOKEN=... acme-support -- ...` 传凭据也能用,但值会以明文写进 Claude Code 的配置文件,只适合短期 token。不要把凭据写死在 server 代码或团队共享的 `.mcp.json` 里。

### 5.2 远程 HTTP server

一个 server 服务全公司时,用 OAuth:server 是**资源服务器**,验证每个请求带的 access token,从里面拿到用户身份和权限范围(scopes),再用这个身份调内部服务。38 篇讲完整的配置;在工具里拿到调用者是这样的:

```python
from mcp.server.auth.middleware.auth_context import get_access_token

async def current_user() -> User:
    token = get_access_token()
    if token is None:
        raise ToolError("未认证")
    return User(id=token.subject, scopes=token.scopes, raw_token=token.token)
```

### 5.3 授权在 server 里做

- 每个写工具检查 scope:没有 `refunds:write` 就返回 `ToolError("你没有退款权限,请联系组长")`
- 调内部服务时用**调用者的身份**,让内部服务再做一次自己的鉴权(纵深防御)
- **不要把收到的 token 原样转发给其他服务**,除非那个 token 本来就是发给那个服务的。MCP 规范明确禁止这种"token 透传"——38 篇讲为什么
- 不要依赖"Claude Code 里用户把这个工具设成了需要确认"来保证安全。用户可以改自己的权限设置,`bypassPermissions` 模式下也可能直接放行;server 端的检查才是不可绕过的

---

## 六、生命周期与连接

HTTP 客户端、数据库连接池、缓存这些东西应该在 server 启动时建一次,而不是每次调用都建:

```python
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
import httpx
from mcp.server import MCPServer
from mcp.server.mcpserver import Context

@dataclass
class App:
    api: httpx.AsyncClient

@asynccontextmanager
async def lifespan(server: MCPServer) -> AsyncIterator[App]:
    api = httpx.AsyncClient(base_url="https://api.internal.acme.com", timeout=10)
    try:
        yield App(api=api)
    finally:
        await api.aclose()

mcp = MCPServer("acme-support", lifespan=lifespan, instructions="……见第七节……")

@mcp.tool(annotations=READ)
async def get_order_status(order_id: str, ctx: Context[App]) -> OrderStatus:
    api = ctx.request_context.lifespan_context.api
    ...
```

v2 里 Streamable HTTP 的 lifespan **只在启动时运行一次**,所有请求共享(v1 是每个会话一次)。所以连接池放在这里很划算,但**不要在 lifespan 里放任何属于某个用户的东西**。

---

## 七、Resources、Prompts 和 Server Instructions

工具之外,三样东西能让 server 在团队里更好用:

**Server instructions**:告诉 Claude 这个 server 是干什么的、什么时候该找它的工具。Claude Code 默认开启工具搜索,会话开始时只加载工具名和 server instructions,所以这段话决定了 Claude 会不会想到去搜你的工具:

```python
INSTRUCTIONS = """Acme 客服运营工具:查询客户、订单、物流、工单,以及在退款政策范围内办理退款。
处理任何关于 Acme 客户、订单号(ORD-开头)、工单号(T-开头)的问题时使用。
退款必须先 preview_refund 再 create_refund。退款政策见资源 policy://refund。"""
```

Claude Code 会截断超过 4096 字符的 instructions,关键信息放前面。

**Resources**:把退款政策、服务等级说明、常见问题处理手册暴露成资源。用户可以 `@acme-support:policy://refund` 把它引用进对话,工具的描述里也可以提示模型去读。

**Prompts**:把团队的标准流程做成斜杠命令,比如 `/acme-support:triage_ticket T-881`:读工单、查客户概况、对照政策、给出处理建议和回复草稿。新人用它和老员工用它得到的是同一套流程。

---

## 八、可观测性与审计

- **审计日志**:每个写操作记录调用者、时间、工具、参数、结果、确认码。这是事后回答"agent 为什么退了这笔款"的唯一依据
- **OpenTelemetry**:Python SDK v2 默认带了 OTel 中间件,每个请求一个 span,配置好 exporter 就能看到;客户端也用 SDK 时 trace 能串起来
- **中间件**:要统一做计时、限流、错误上报,低层 `Server` 支持中间件
- **日志里不要出现 token 和个人信息**;stdio server 的日志写 stderr
- **看使用数据**:哪些工具被调用最多、哪些经常出错、哪些从没被用过。从没被用过的工具,往往是名字或描述写得不好

---

## 九、一个完整的骨架

```python
# acme_support/server.py
from typing import Annotated, Literal
from pydantic import BaseModel, Field
from mcp.server import MCPServer
from mcp.server.mcpserver import Context, Resolve
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from .app import App, lifespan, current_user, User, audit, INSTRUCTIONS

READ = ToolAnnotations(read_only_hint=True, open_world_hint=False)
DANGER = ToolAnnotations(read_only_hint=False, destructive_hint=True)

mcp = MCPServer("acme-support", instructions=INSTRUCTIONS, lifespan=lifespan)

class CustomerOverview(BaseModel):
    customer_id: str
    name: str
    tier: Literal["standard", "gold", "platinum"]
    recent_orders: list[str] = Field(description="最近 5 笔订单的一行摘要")
    open_tickets: list[str] = Field(description="未结工单的一行摘要")

@mcp.tool(annotations=READ)
async def get_customer_overview(
    customer: Annotated[str, Field(description="客户 ID(C- 开头)、邮箱或手机号")],
    ctx: Context[App],
    user: Annotated[User, Resolve(current_user)],
) -> CustomerOverview:
    """查询客户概况:等级、最近订单、未结工单。回答任何关于某个客户的问题时先用它。"""
    api = ctx.request_context.lifespan_context.api
    r = await api.get("/customers/lookup", params={"q": customer}, headers=user.auth_headers())
    if r.status_code == 404:
        raise ToolError(f"找不到客户 {customer!r}。请确认 ID、邮箱或手机号是否正确。")
    if r.status_code == 403:
        raise ToolError("你没有查看这个客户的权限。")
    r.raise_for_status()
    return CustomerOverview.model_validate(summarize_customer(r.json()))

class RefundPreview(BaseModel):
    allowed: bool
    explanation: str = Field(description="是否符合退款政策,以及原因")
    amount_cents: int
    channel: str
    confirmation_code: str | None = Field(description="allowed 为 true 时给出,10 分钟内有效")

@mcp.tool(annotations=READ)
async def preview_refund(
    order_id: str,
    amount_cents: Annotated[int, Field(gt=0, description="退款金额,单位为分")],
    reason: Literal["shipping_delay", "damaged", "wrong_item", "goodwill"],
    ctx: Context[App],
    user: Annotated[User, Resolve(current_user)],
) -> RefundPreview:
    """预览退款:检查政策和权限,返回会退多少、退到哪里和确认码。不会实际退款。"""
    ...

@mcp.tool(annotations=DANGER, meta={"anthropic/requiresUserInteraction": True})
async def create_refund(
    confirmation_code: Annotated[str, Field(description="preview_refund 返回的确认码")],
    ctx: Context[App],
    user: Annotated[User, Resolve(current_user)],
) -> str:
    """执行一笔已预览过的退款。同一个确认码只会生效一次。"""
    if "refunds:write" not in user.scopes:
        raise ToolError("你没有退款权限,请联系组长处理。")
    result = await execute_refund(ctx, user, confirmation_code)     # 幂等:按确认码去重
    await audit(user, "create_refund", {"confirmation_code": confirmation_code}, result)
    return f"已退款 {result.amount_cents / 100:.2f} 元到{result.channel},退款单号 {result.refund_id}。"

@mcp.resource("policy://refund")
def refund_policy() -> str:
    """当前生效的退款政策全文。"""
    return load_policy("refund")

@mcp.prompt()
def triage_ticket(ticket_id: str) -> str:
    """按标准流程分析一张工单,给出处理建议和回复草稿。"""
    return (f"请处理工单 {ticket_id}:1) 读工单和客户概况;2) 对照 policy://refund 判断是否需要退款;"
            "3) 给出处理建议;4) 起草一封给客户的回复。不要直接执行退款。")

def main():
    mcp.run()
```

---

## 十、打包与分发

### 10.1 本地 stdio:发成一个包

把 server 发布到公司内部的 PyPI 或 npm 仓库,用户一条命令就能接入:

```bash
claude mcp add acme-support -- uvx --index-url https://pypi.internal.acme.com/simple acme-support-mcp
```

- 版本号要认真维护,写 changelog。工具名、参数名的改动是**破坏性变更**
- 要废弃一个工具,先在描述里写"已废弃,请用 xxx",保留一两个版本再删

### 10.2 跟着仓库走:项目级 `.mcp.json`

只和某个仓库相关的 server(比如这个服务自己的运维工具),用 `--scope project` 写进仓库的 `.mcp.json`,克隆仓库的人都能用;第一次使用时 Claude Code 会请用户批准(12 篇)。

### 10.3 和 skills 一起:做成 plugin

把 server、配套的 skills(比如"退款处理规范")、子 agent 定义打包成一个 plugin,放进公司的 marketplace(14 篇)。用户装一个插件,得到的是一整套能力。

### 10.4 零安装:远程 HTTP

一个 server 服务全公司、用户不想装任何东西,或者 server 需要访问只有服务器能访问的网络——部署成远程 Streamable HTTP server,用 OAuth 认证。这是 38 篇的内容。远程 server 也能被 Managed Agents 和 Messages API 的 MCP connector(28、31 篇)使用,本地 stdio server 不行。

---

## 十一、踩坑

1. **server 直连生产数据库**——绕过业务规则和服务层鉴权,包装已有的 API
2. **用一个高权限的服务账号调内部 API**——每个用户通过 agent 都成了管理员,审计也查不到人
3. **把内部 API 一比一包装成几十个工具**——按任务设计,第一版三到八个
4. **退款、删除这类工具没有预览和确认**——拆成 preview + create,加 `requiresUserInteraction`
5. **写操作没有幂等键**——模型重试一次就退了两次款
6. **当前用户、价格这类值让模型传进来**——用 `Resolve` 由 server 提供,模型填不了也改不了
7. **安全只靠 Claude Code 的权限规则**——用户能改,server 端的检查才是边界
8. **把收到的 token 透传给下游服务**——规范禁止,用发给下游的凭据
9. **lifespan 里缓存了某个用户的数据**——它被所有请求共享
10. **发布后随意改工具名和参数**——用户的权限规则、提示词、自动化全部失效

---

下一篇:`38-MCP安全与远程化.md`,讲把 MCP server 部署成远程服务:Streamable HTTP 在新协议下的无状态部署、兼容老客户端、Host 校验、OAuth 资源服务器的配置,以及 MCP 特有的安全威胁——工具投毒、提示注入、token 透传、混淆代理——和对应的防御。
