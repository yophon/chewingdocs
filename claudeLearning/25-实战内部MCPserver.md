# 实战内部 MCP server

24 篇讲了一个个人 wiki server。这一篇放大到企业场景:**怎么把公司内部的部署平台 / 监控 / 工单 / 内部 wiki / 内部审批 包装成 MCP server,让全公司工程师在 Claude Code 里直接用**。这是 2026 年最被低估的 dev experience 投资——一个写得好的内部 MCP server,**比建个内部 IDE 插件 ROI 高一个量级**。

> 一句话先记住:**内部 MCP server 的核心不是"接口",而是"边界"——哪些数据敏感、哪些操作要审批、哪些能给 LLM 自由用**。把边界定清楚,server 就活了。

---

## 一、典型企业场景

下面这些 2026 年很多公司都在做:

| 场景 | server 干什么 | 受众 |
| --- | --- | --- |
| **部署 server** | 看部署状态 / 触发 staging / 看 build log | 全员 |
| **监控 server** | 查 Prometheus / Datadog 指标 / 查 trace | SRE / 后端 |
| **工单 server** | 看 Jira / Linear 工单 / 留 comment | PM / 工程师 |
| **内部 wiki server** | 全公司知识库搜索 / 抽段 | 全员 |
| **审批 server** | 提 / 看审批 | 全员 |
| **运维 server** | K8s 看 pod / 拉 log | SRE / 平台组 |
| **客户工单 server** | 客服系统读写 | 客服 / 售后 |

> 共同点:**都是"内部已有平台,但操作走 GUI 慢,API 没人愿意学"**。MCP 让"用自然语言操作内部平台"变成现实。

---

## 二、架构选型:stdio 还是 streamable HTTP

### 2.1 stdio(本地)

每个工程师本地跑一份 server 子进程,用 token / 个人 SSO 直接访问内部平台。

**优点**:

- 部署简单(npm package / pip package + 配置文件)
- 鉴权直接复用工程师本地 token / SSO
- 不需要建 server 端基础设施

**缺点**:

- 每个工程师本地装 server(版本管理略麻烦)
- 不能跨工程师共享状态(audit log、limits)
- 改一次 server 全员升级

### 2.2 Streamable HTTP(中央化)

公司内网起一个 MCP server 集群,所有工程师 Claude Code 通过 URL 访问,服务端走 OAuth / Bearer。

**优点**:

- 中央化:升级、监控、审计、限流都好做
- 鉴权统一(SSO / OAuth)
- 多用户共享缓存 / 配额

**缺点**:

- 要建基础设施(部署、监控、HA)
- 网络必须可达(VPN / 内网)
- 实现略复杂

> 经验:**先 stdio 起步,3-5 个用户验证价值;站稳了升级 streamable HTTP 中央化**。 别一开始就基建,会过度工程化。

---

## 三、最小可用例子:内部部署 server(stdio 版)

需求:工程师在 Claude Code 里能"看部署状态 / 触发 staging 部署 / 看 build log"。

```python
# deploy_server.py
import os, subprocess, requests
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("deploy")
DEPLOY_API = os.environ["DEPLOY_API_URL"]
TOKEN = os.environ["DEPLOY_TOKEN"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

@mcp.tool()
def get_deploy_status(env: str, service: str) -> str:
    """查某环境某服务的当前部署状态。
    env: staging / production-cn / production-us
    service: 服务名(用 list_services 查)。
    返回:版本 / commit / 部署时间 / 健康检查"""
    if env not in ("staging", "production-cn", "production-us"):
        return "env 不合法"
    r = requests.get(f"{DEPLOY_API}/deploys/{env}/{service}", headers=HEADERS)
    r.raise_for_status()
    d = r.json()
    return (
        f"环境: {env}\n服务: {service}\n"
        f"版本: {d['version']} (commit {d['commit'][:8]})\n"
        f"部署时间: {d['deployed_at']}\n"
        f"健康: {d['health']}"
    )

@mcp.tool()
def list_services(env: str = "staging") -> str:
    """列出某环境的所有服务名。"""
    r = requests.get(f"{DEPLOY_API}/services?env={env}", headers=HEADERS)
    return "\n".join(s["name"] for s in r.json())

@mcp.tool()
def deploy_to_staging(service: str, ref: str = "main", confirm: bool = False) -> str:
    """触发 staging 环境部署。
    service: 服务名
    ref: git ref(branch / tag / commit)
    **破坏性,confirm=True 才执行,否则只 dry_run**。"""
    if not confirm:
        return f"[DRY RUN] 会把 {service}@{ref} 部署到 staging,用 confirm=True 真执行"
    r = requests.post(
        f"{DEPLOY_API}/deploy",
        headers=HEADERS,
        json={"env": "staging", "service": service, "ref": ref},
    )
    r.raise_for_status()
    return f"已触发部署 {service}@{ref} → staging,任务 id {r.json()['job_id']}"

@mcp.tool()
def get_build_log(job_id: str, lines: int = 100) -> str:
    """读部署任务的 build log,默认最后 100 行。"""
    r = requests.get(
        f"{DEPLOY_API}/jobs/{job_id}/log?lines={lines}",
        headers=HEADERS,
    )
    return r.text[:50_000]   # 防止过大

if __name__ == "__main__":
    mcp.run()
```

工程师在自己机器上:

```bash
export DEPLOY_API_URL="https://deploy.company.internal"
export DEPLOY_TOKEN="$(oktactl token)"

claude mcp add -s user deploy -- python /path/to/deploy_server.py
```

之后在 Claude Code 里:

> "看一下 staging 上 api-gateway 的部署版本"
> "把当前分支 deploy 到 staging,confirm"

---

## 四、企业落地的几条铁律

### 4.1 写权限默认 dry_run

任何"会改 prod 状态"的 tool 都要 `confirm: bool` 参数,默认 false。第一次 LLM 调通常忘 confirm,你返回 dry_run,LLM 会主动问用户确认。

### 4.2 危险操作只暴露给非生产

```python
@mcp.tool()
def deploy_to_production(...):
    """触发生产部署。**为安全考虑,本 server 不暴露此 tool;走 GUI 走审批**。"""
    return "请走审批工作流,本通道不开放"
```

或者**根本不实现**——别给 LLM 调 prod 的钥匙,**生产部署一律走 GUI + 审批人**。

### 4.3 Audit log 内置

```python
@mcp.tool()
def deploy_to_staging(service, ref, confirm=False):
    audit_log({
        "user": os.environ.get("USER"),
        "tool": "deploy_to_staging",
        "args": {"service": service, "ref": ref},
        "timestamp": datetime.utcnow().isoformat(),
    })
    ...
```

每个 LLM 调用记一笔——后期出事能追到谁的 LLM 干的。**比 IDE 操作更需要 audit**(自然语言不留具体动作记录)。

### 4.4 Description 写公司语境

```python
@mcp.tool()
def get_deploy_status(env: str, service: str) -> str:
    """查某环境某服务的部署状态。

    我们公司 env 三类:
    - staging:一般测试环境
    - production-cn:中国生产
    - production-us:美国生产

    服务命名规则:`{team}-{name}`,如 `payment-gateway`。
    """
```

LLM 不知道公司术语和命名约定——**全写在 description 里**。新人上手 + LLM 上手都受益。

### 4.5 限流

每用户 / 每 server 操作上限,防 LLM 出 bug 调爆 API:

```python
from collections import defaultdict
from time import time

user_calls = defaultdict(list)

def rate_limit(user, max_per_min=30):
    now = time()
    user_calls[user] = [t for t in user_calls[user] if t > now - 60]
    if len(user_calls[user]) >= max_per_min:
        raise RuntimeError("rate limit exceeded")
    user_calls[user].append(now)
```

---

## 五、Streamable HTTP 中央化版本

需求增长后,把 stdio 版搬到 server 集群。

```python
# 用 FastMCP 的 HTTP 模式
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("deploy")

@mcp.tool()
def get_deploy_status(env: str, service: str, ctx) -> str:
    user = ctx.user            # 从 token 解出来
    ...

if __name__ == "__main__":
    mcp.run(transport="streamable-http", port=8080)
```

部署到 K8s,前面挂 OAuth 网关:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Claude Code  │ →  │ OAuth 网关     │ →  │ MCP server   │
│ (员工本地)    │    │ (SSO/Okta)   │    │ (K8s pod)    │
└──────────────┘    └──────────────┘    └──────┬───────┘
                                              ↓
                                  ┌─────────────────────┐
                                  │ 内部部署平台 / DB     │
                                  └─────────────────────┘
```

工程师 Claude Code 配置:

```json
{
  "mcpServers": {
    "company-deploy": {
      "url": "https://mcp.company.internal/deploy",
      "headers": { "Authorization": "Bearer ${COMPANY_TOKEN}" }
    }
  }
}
```

---

## 六、版本管理与灰度发布

server 改了不能让所有人立刻用——影响面太大。

### 6.1 灰度发布

```
v1 部署在主路径 /mcp/deploy
v2 部署在 /mcp/deploy-v2
工程师按需 opt-in v2
v2 稳定 1 周 → 切换默认到 v2
```

### 6.2 兼容性

废弃一个 tool 至少留一个版本作为 deprecated(返回 warning 但仍工作),避免突然断 LLM。

```python
@mcp.tool()
def old_tool(...):
    """[DEPRECATED] 用 new_tool 替代,本 tool 会在 v3 移除。"""
    log_warning("old_tool used")
    ...
```

### 6.3 生产环境监控

每个 tool 上 metrics:调用次数、成功率、平均延迟、p99。**定期 review**:

- 哪些 tool 没人用 → 删
- 哪些 tool 慢 → 优化
- 哪些 tool 频繁失败 → 修

---

## 七、内部 wiki MCP server

这是另一个常见场景,值得单独说。

```python
@mcp.tool()
def search_wiki(query: str, space: str = "all", limit: int = 10) -> str:
    """搜公司内部 wiki(基于 Confluence / Notion / 自建)。
    space: 空间名(eng / hr / sales / all)
    返回:title + url + 简短 excerpt
    用户问技术问题、流程问题、政策问题时优先用此 tool。"""
    results = wiki_client.search(query=query, space=space, limit=limit)
    return "\n\n".join(
        f"## {r.title}\n{r.url}\n{r.excerpt}" for r in results
    )

@mcp.tool()
def get_wiki_page(url: str) -> str:
    """读 wiki 页面完整内容(配 search_wiki 用)。"""
    page = wiki_client.fetch(url)
    if len(page.content) > 50_000:
        return page.content[:50_000] + "\n[截断,内容过长]"
    return page.content
```

接进 Claude Code 后,工程师问"我们公司怎么处理紧急 oncall?",Claude 自动调 search_wiki + get_wiki_page,5 秒给出答案 + 引用链接。

> 这一个 server 顶得上招一个文档管理员。**每个稍大公司都该有一个内部 wiki MCP**。

---

## 八、Resources 在企业场景的妙用

部分内部数据(配置文件、API spec、设计稿)适合做 Resources(只读、按需注入):

```python
@mcp.resource("apispec://service/{service_name}")
def service_apispec(service_name: str) -> str:
    return openapi_client.fetch(service_name).raw_yaml
```

工程师在 Claude Code 里把 `apispec://service/payment` 拉进对话,LLM 就拿到完整 OpenAPI spec,**不用调 tool 来回拉**。

---

## 九、企业部署 checklist

新做一个内部 MCP server 上线前,过这些:

### 必做

- [ ] 所有写 tool 有 `confirm` 参数 + dry_run
- [ ] 危险操作不暴露(prod 部署、删数据)
- [ ] 鉴权用公司 SSO,不允许个人 token 长期保留
- [ ] Audit log(谁调的、何时、什么参数、结果)
- [ ] 限流(每用户每分钟 / 每天)
- [ ] description 写清楚公司语境
- [ ] 错误处理(失败返回 isError + 友好信息)
- [ ] 大返回值截断
- [ ] README:怎么装 / 怎么配 token / 故障排查

### 建议

- [ ] Metrics + monitoring
- [ ] 版本号 + deprecation 策略
- [ ] 灰度发布通道(staging server)
- [ ] 测试套件(同时 cover stdio 和 http 模式)
- [ ] 向团队推广(demo + 文档 + slack 答疑)

### 可选

- [ ] Streamable HTTP 中央化(规模到一定再做)
- [ ] OAuth scope 细分
- [ ] 多语言 SDK(如果需要给非 Claude 客户端)

---

## 十、推广与 onboarding

server 写完没人用很常见。**写完只完成 50%,推广占另一半**。

策略:

1. **Demo 视频**:5 分钟演示"以前 vs 现在"
2. **集成到 onboarding**:新人入职文档里写"装这个 server"
3. **Slack 答疑频道**:#mcp-server-deploy 之类
4. **使用统计每周公开**:"本周谁用了多少次"营造氛围
5. **找 5 个 power user 当种子**:他们在团队群里自然推

---

## 十一、踩坑

1. **暴露 prod 写权限**——某天 LLM 误调,生产挂;**生产改动一律走 GUI**
2. **不做 audit log**——出事查不到谁调的
3. **token 写代码里**——别的工程师拷代码就拿到你的 token
4. **description 全英文**——非英语团队成员表达"看部署状态"时 LLM 匹配不上
5. **server 启动慢 / cold start 久**——每次 Claude Code 起 session 都要等几秒
6. **大返回不截断**——一次拉 10K 行 log 撑爆 context
7. **改 server 不通知**——同事一觉醒来发现 tool 没了 / 行为变了
8. **没人测试就上线**——给团队推荐前自己只跑过 happy path,部署当天事故
9. **限流没做,LLM bug 调爆**——某用户 LLM 卡循环,一晚上调了 50 万次
10. **本地版升级困难**——server 在 50 个工程师电脑上有 50 个版本;**同期 streamable HTTP 中央化**

---

下一篇:`26-MCP安全与远程化.md`,讲 OAuth、Streamable HTTP、scope、token 管理、企业级 MCP server 的安全模型。
