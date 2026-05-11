# MCP 安全与远程化

stdio MCP 跑在工程师本地,基本只承担"个人鉴权 + 进程隔离"两件事。一旦走 streamable HTTP 中央化,**MCP server 就变成了多用户共享的内部服务**——这时候安全模型完全是另一个量级:OAuth、scope、token 轮换、attack surface、审计、合规。这一篇把这些讲清楚,**避免你写出"看起来很方便,实则是个大洞"的远程 MCP server**。

> 一句话先记住:**stdio 模式安全靠 OS 进程隔离;远程 MCP 安全靠 OAuth + scope + 网络边界 + 审计日志**。把内部系统包成 MCP server 等于多开了一个新的攻击面,**护栏要明确做出来**。

---

## 一、安全模型分层

```
┌────────────────────────────────────────────────────┐
│ 1. 网络层:VPN / 内网 / 公网?                        │
│ 2. 传输层:mTLS / HTTPS                             │
│ 3. 鉴权层:OAuth / Bearer / mTLS cert              │
│ 4. 授权层:scope / RBAC / 业务规则                  │
│ 5. 应用层:tool 内部权限检查 / dry_run / confirm    │
│ 6. 审计层:谁调了什么、何时、结果                     │
└────────────────────────────────────────────────────┘
```

**每一层都得做**——任意一层缺了,整个安全可信度归零。

---

## 二、网络边界:三种部署形态

### 2.1 内网(VPN-only)

```
工程师 → VPN → 内网 MCP server
```

**最安全**,但要求工程师必须连 VPN。适合公司内部敏感系统。

### 2.2 公网 + 强鉴权

```
工程师 → 公网 → MCP server(OAuth)
```

适合 SaaS 化(Notion / Linear 等官方 server)、远程办公团队。**鉴权和限流必须做扎实**。

### 2.3 混合

```
读型 tool:公网 + Bearer
写型 tool:内网 only
```

按敏感度分级——非破坏性 tool 公网放开,破坏性的强制走 VPN。

---

## 三、OAuth(2025 起 MCP 推荐方案)

MCP 协议 2025 年规范引入 OAuth 2.1,**远程 server 默认走这个**。

### 3.1 流程

```
1. Claude Code 看到 server URL 但没 token
   ↓
2. 浏览器跳转到 OAuth 授权页(SSO 登录)
   ↓
3. 用户授权(具体 scope)
   ↓
4. 拿 access token + refresh token,本地存
   ↓
5. 调 server 时带 Authorization: Bearer <access_token>
   ↓
6. token 过期前自动用 refresh token 续
```

### 3.2 Server 端实现要点

```python
from mcp.server.fastmcp import FastMCP
from mcp.server.auth import OAuthProvider

mcp = FastMCP("my-server")
mcp.set_oauth_provider(OAuthProvider(
    issuer="https://auth.company.com",
    audience="mcp-deploy-server",
    scopes={
        "deploy:read": "查看部署状态",
        "deploy:staging": "触发 staging 部署",
        "deploy:prod": "触发生产部署",
    },
))

@mcp.tool(required_scope="deploy:read")
def get_deploy_status(...):
    ...

@mcp.tool(required_scope="deploy:staging")
def deploy_to_staging(...):
    ...

@mcp.tool(required_scope="deploy:prod")
def deploy_to_prod(...):
    ...
```

> Scope 是关键——不同 tool 不同权限要求,**LLM 拿不到的 scope 那部分 tool 直接不可见**。

---

## 四、Scope 设计

### 4.1 按敏感度分

```
read-only        →  广泛授予
write-staging    →  开发都能要
write-prod       →  仅 release 角色
admin            →  仅运维 / 管理员
billing          →  仅财务
```

### 4.2 默认最小

OAuth 授权时,**默认只勾选 read-only**;敏感 scope 用户主动确认。

### 4.3 时间窗口

某些 scope 不应永久授权:

```
deploy:prod:1h-only  →  当次审批,1 小时后失效
```

---

## 五、Token 管理

### 5.1 Access Token 生命周期

```
access token:    1 小时(短)
refresh token:   30 天(长)
```

短 access 即使泄漏窗口也短;refresh 撤销了所有依赖它的 access 立刻失效。

### 5.2 Token 存哪

| 客户端 | 存储 |
| --- | --- |
| Claude Code(CLI) | 加密文件 / OS keychain |
| 公司 SaaS 用 Claude Code | 不要进 git |
| Server 端缓存 access token | 内存 / Redis(短 TTL) |

**绝对不要**:

- 写到 `.mcp.json`(进 git)
- 写到 `~/.bashrc`(明文)
- 写到日志(意外 dump)

### 5.3 撤销机制

OAuth 提供撤销端点。**user 离职 / 账号被盗时立刻撤销**:

```
POST /oauth/revoke
{ "token": "<refresh_token>" }
```

撤销后所有派生 access 立刻失效。

---

## 六、Streamable HTTP 协议要点

MCP 2025 把传输层从早期 SSE 升级到 **Streamable HTTP**。和普通 HTTP 区别:

| 特性 | Streamable HTTP |
| --- | --- |
| 单一端点 | 不像 SSE 要"接收端 + 发送端"两个 URL |
| 流式响应 | server-sent events / chunked transfer |
| 可恢复 | 网络断后用 session id 继续 |
| 鉴权 | 标准 HTTP headers(OAuth Bearer / API key)|

**实现侧**:用 SDK 的 `transport="streamable-http"` 模式,绝大多数情况你不直接处理协议。

---

## 七、Server 端最小实现(streamable HTTP + OAuth)

```python
from fastapi import FastAPI, Depends, HTTPException, Header
from mcp.server.fastmcp import FastMCP

app = FastAPI()
mcp = FastMCP("deploy")

async def verify_token(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401)
    token = authorization[7:]
    info = await oauth_introspect(token)        # 调你的 OAuth provider
    if not info["active"]:
        raise HTTPException(401)
    return info        # {"user": "...", "scopes": [...]}

@mcp.tool()
async def get_deploy_status(env: str, service: str, ctx) -> str:
    """..."""
    # ctx 里能拿到 user / scopes
    if "deploy:read" not in ctx.user.scopes:
        return "权限不足"
    ...

# 把 mcp 挂到 FastAPI
app.mount("/mcp/deploy", mcp.streamable_http_app(deps=[Depends(verify_token)]))
```

工程师配置:

```json
{
  "mcpServers": {
    "company-deploy": {
      "url": "https://mcp.company.internal/mcp/deploy",
      "headers": { "Authorization": "Bearer ${TOKEN}" }
    }
  }
}
```

---

## 八、攻击面与防御

### 8.1 注入攻击

LLM 可能传"恶意"参数(因为它读了用户输入)。Server 端**必须**做严格 schema + 业务校验:

```python
@mcp.tool()
def search(query: str):
    if len(query) > 200:
        return {"isError": True, "content": [{"type": "text", "text": "query 过长"}]}
    if any(c in query for c in [";", "--", "/*"]):
        return {"isError": True, ...}
    ...
```

### 8.2 SSRF

Server 内部调外部 URL 时(比如 fetch URL tool),**白名单可访问的 URL**:

```python
ALLOWED_HOSTS = {"docs.company.com", "api.company.com"}

@mcp.tool()
def fetch_internal(url: str):
    parsed = urlparse(url)
    if parsed.hostname not in ALLOWED_HOSTS:
        return {"isError": True, "content": [{"type": "text", "text": "host 不在白名单"}]}
    ...
```

### 8.3 资源耗尽

LLM 可能不停调一个昂贵 tool(查海量数据)。**限流 + 单次成本上限**:

```python
@mcp.tool()
def big_query(sql: str):
    cost = estimate_query_cost(sql)
    if cost > MAX_QUERY_COST:
        return {"isError": True, "content": [{"type": "text", "text": "查询太重"}]}
    ...
```

### 8.4 Tool description 钓鱼

恶意 server 写一个看似 "search_email" 的 tool,实际偷邮件内容。**用户安装新 server 前看 source / 看 description / 看权限**。

> Anthropic 的 marketplace / 内部审核机制会减轻这个风险,但**第三方 server 的供应链审查**仍然是用户责任。

---

## 九、审计:每条 tool 调用留痕

```python
import logging
logger = logging.getLogger("mcp.audit")

@mcp.tool()
async def deploy_to_staging(service, ref, confirm, ctx):
    logger.info({
        "user": ctx.user.id,
        "tool": "deploy_to_staging",
        "args": {"service": service, "ref": ref, "confirm": confirm},
        "timestamp": datetime.utcnow().isoformat(),
        "session_id": ctx.session_id,
    })
    ...
```

把日志:

- 中央 ELK / Loki / Datadog
- 写入 immutable storage(S3 + object lock)合规
- 异常 LLM 行为(高频调危险 tool)报警

**审计是"事后追责"的唯一线索**,出事时没日志 = 没法处理。

---

## 十、合规与数据出境

### 10.1 数据走过 LLM 后

LLM 的 prompt 默认可能进入 Anthropic 训练 / 改进流程(具体看 enterprise 协议)。**敏感数据**:

- 客户 PII(姓名、邮箱、电话、身份证)
- 财务数据
- 内部源代码(部分公司视为敏感)

**对策**:

- 用 enterprise plan 关掉训练
- Server 端**主动脱敏**(返回的内容里 PII 先 mask 再给 LLM)
- 不让 LLM 看到完整 record,只给 ID 让 LLM 转给真人

### 10.2 跨境

国内外业务的 server 严格分网段:

```
中国业务 server:仅中国 region 部署,API 走国内 endpoint
海外业务 server:海外 region,跨境数据走合规通道
```

LLM 调用时也注意 endpoint(走 Bedrock 区域、Vertex 区域)。

---

## 十一、Claude Code 客户端侧的安全配置

回到工程师视角,**别让一个恶意的 MCP server 偷你**:

1. **`enableAllProjectMcpServers: false`**(默认)——不显式信任的 project server 不启动
2. **审 PR 时看 `.mcp.json` 改动**——别让别人偷偷加 server
3. **`enabledMcpjsonServers: [...]`**——白名单显式
4. **`permissions.deny`** 拦截危险 mcp tool:
   ```json
   "deny": ["mcp__deploy__deploy_to_prod*", "mcp__db__delete_*"]
   ```
5. **Token 不进 git**——`.gitignore` 加 `.claude/settings.local.json`

---

## 十二、踩坑

1. **远程 server 公网无鉴权**——某天有人扫到你的 mcp endpoint 直接调
2. **OAuth scope 不分**——给所有人 admin scope,LLM 可以删 prod
3. **token 永久不过期**——离职员工的 token 还能调 server
4. **不审计**——出事查不到谁调的
5. **不限流**——某 LLM bug 一晚上 50 万次调用
6. **没 mTLS 内网"以为安全"**——内网横向移动后任意服务都能访问
7. **错误信息泄漏架构**——返回 stack trace 把内部架构暴露了;**生产返回简化错误**
8. **dependency 没 lock**——server 升级 `requests` 引入 CVE,你不知道
9. **MCP server 跑 root**——降权运行(user namespace、systemd User=);**默认普通用户**
10. **第三方 server 不审就装**——README 写得好不代表代码安全;**production 用 server 看一遍 source**

---

下一篇:`27-MCP进阶ResourcesPrompts.md`,把 24-26 重点放在 tools,本篇把 Resources / Prompts / Streaming progress / Sampling 这些"非 tool"原语讲完整。
