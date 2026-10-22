# Managed Agents

前面几篇讲的都是"你写循环":调 Messages API,收到 `tool_use` 就执行工具,把结果送回去,直到模型说做完了。这样最灵活,但你得自己准备执行代码的环境、管理会话状态、处理断线重连、做定时调度。**Managed Agents 把这些全部托管了**:agent 循环跑在 Anthropic 的编排层,工具在 Anthropic 为每个会话准备的容器里执行,你只需要定义 agent、启动会话、收事件流。

> 一句话先记住:**agent 创建一次,会话每次运行都新建**。agent 是一个持久化、带版本的配置对象(模型、提示词、工具、MCP、skills),会话引用它来运行。每次运行都重新创建 agent,是使用 Managed Agents 最常见的错误。

Managed Agents 目前是 beta,只在 Claude API 和 Claude Platform on AWS 上提供。SDK 会自动带上 `managed-agents-2026-04-01` beta 头。

---

## 一、什么时候用它

| 你的需求 | 用什么 |
| --- | --- |
| 一次调用就能完成:分类、抽取、问答 | Messages API(23 篇) |
| 你自己编排流程,工具在你的服务器上跑 | Messages API + Tool Runner(24 篇) |
| 要一个现成的 agent 循环,但跑在你的进程里、操作你的文件系统 | Agent SDK(32-34 篇) |
| **agent 要一个独立的工作区(装包、跑代码、改文件),而且你不想维护这个环境** | **Managed Agents** |
| 定时运行的 agent(每晚、每周) | Managed Agents 的定时部署 |
| 一个交付物要达到质量标准,"改到合格为止" | Managed Agents 的 outcomes |

"最简单"指的是**你要维护的代码最少**。对托管、定时、带记忆的 agent 来说,Managed Agents 虽然是个更大的平台,往往反而是最简单的选择:没有循环代码、没有状态文件、没有调度器。

---

## 二、四个核心概念

| 概念 | 接口 | 是什么 |
| --- | --- | --- |
| **Agent** | `/v1/agents` | 持久化、带版本的配置:模型、system prompt、工具、MCP server、skills |
| **Environment** | `/v1/environments` | 容器的模板:网络策略、预装的包 |
| **Session** | `/v1/sessions` | 一次有状态的运行:引用一个 agent 和一个 environment,产生事件流 |
| **Container** | — | 每个会话一个的隔离计算环境,**工具在这里执行** |

```
Agent(配置)──→ Anthropic 编排层(agent 循环)
                       │ 工具调用
                       ▼
Environment(模板)──→ Container(工具执行的工作区)
                       │
                Session ┼── Resources(文件、GitHub 仓库、memory store)
                        ├── Vault(凭据)
                        └── 事件流(进 / 出)
```

注意:**agent 循环不在容器里跑**,它在编排层,通过工具调用操作容器。容器里只有工具执行的结果。

---

## 三、从零跑起来

### 3.1 创建 environment 和 agent(一次性)

```python
import anthropic
client = anthropic.Anthropic()

environment = client.beta.environments.create(
    name="dev-env",
    config={
        "type": "cloud",
        "networking": {"type": "limited", "allow_package_managers": True, "allow_mcp_servers": True},
    },
)

agent = client.beta.agents.create(
    name="Code Reviewer",
    model="claude-opus-5-5",
    system="你是一名资深代码审查者。只报告真实的问题,每个问题给出文件和行号。",
    tools=[{
        "type": "agent_toolset_20260401",
        "default_config": {"enabled": True, "permission_policy": {"type": "auto"}},
        "configs": [
            {"name": "web_fetch", "enabled": False},
            {"name": "web_search", "enabled": False},
        ],
    }],
)
print(agent.id, agent.version)     # 存下来:配置文件、环境变量或密钥管理服务
```

**这段代码属于初始化脚本,不属于每次运行的路径**。更好的做法是把 agent 和 environment 写成版本控制里的配置文件,用 `ant apply` 同步,它会把 ID 记在 `claude-lock.json` 里。

### 3.2 每次运行:创建会话、发消息、收事件

```python
session = client.beta.sessions.create(
    agent={"type": "agent", "id": AGENT_ID, "version": AGENT_VERSION},
    environment_id=ENV_ID,
    title="审查 auth 模块",
    resources=[{
        "type": "github_repository",
        "url": "https://github.com/acme/backend",
        "mount_path": "/workspace/repo",
        "authorization_token": os.environ["GITHUB_TOKEN"],
        "checkout": {"type": "branch", "name": "main"},
    }],
)
print(f"https://platform.claude.com/workspaces/default/sessions/{session.id}")   # 控制台里实时看

with client.beta.sessions.events.stream(session_id=session.id) as stream:
    # 先打开流,再发消息——流只推送打开之后发生的事件
    client.beta.sessions.events.send(
        session_id=session.id,
        events=[{"type": "user.message", "content": [{"type": "text", "text": "审查 auth 模块"}]}],
    )
    for event in stream:
        if event.type == "agent.message":
            for block in event.content:
                if block.type == "text":
                    print(block.text, end="", flush=True)
        elif event.type in ("agent.tool_use", "agent.mcp_tool_use") and event.evaluated_permission == "ask":
            client.beta.sessions.events.send(session_id=session.id, events=[{
                "type": "user.tool_confirmation",
                "tool_use_id": event.id,                       # 是事件 ID(sevt_...),不是 toolu_ ID
                "result": "allow" if approve(event) else "deny",
            }])
        elif event.type == "session.status_idle":
            if event.stop_reason.type != "requires_action":   # requires_action 表示在等你,继续收
                break
        elif event.type == "session.status_terminated":
            break
```

会话状态:`rescheduling → running ⇄ idle → terminated`。`idle` 表示做完了在等输入,或者在等你确认工具、返回自定义工具结果,或者到了预算上限。错误以 `session.error` 事件出现在流里,不是一个状态。`terminated` 不一定是失败,要取一下会话对象才知道。

### 3.3 改 agent:更新,不要重建

```python
client.beta.agents.update(AGENT_ID, system="……新的提示词……")    # 生成新版本
```

每次更新生成一个不可变的新版本。**正在运行的会话继续用它创建时的版本**,新会话用最新版本,或者显式指定版本号。这让你可以安全地迭代提示词、出问题时回滚、同时 A/B 测试两个版本。每次运行都 `agents.create()` 会留下一堆孤儿 agent,这些好处也全没了。

---

## 四、工具与权限

### 4.1 三类工具

| 类型 | 谁执行 | 说明 |
| --- | --- | --- |
| 预置工具 `agent_toolset_20260401` | Anthropic,在会话容器里 | `bash`、`read`、`write`、`edit`、`glob`、`grep`、`web_fetch`、`web_search` |
| MCP 工具 `mcp_toolset` | Anthropic 编排层 | 连接的 MCP server 提供的能力 |
| 自定义工具 `custom` | **你** | agent 发出 `agent.custom_tool_use`,会话进入 idle,你回 `user.custom_tool_result` |

只写 `{"type": "agent_toolset_20260401"}` 会**把 8 个工具全部打开**,包括两个联网工具。建议显式关掉 `web_fetch` 和 `web_search`,任务确实需要时再打开。

### 4.2 权限策略

| 策略 | 行为 | 默认用于 |
| --- | --- | --- |
| `always_allow` | 直接执行 | 预置工具 |
| `always_ask` | 暂停,等你发 `user.tool_confirmation` | MCP 工具 |
| `auto` | 服务端评估每次调用:安全的直接执行,高风险的拒绝,判断不了的暂停等你 | 需要显式设置;**预置工具推荐用它** |

`auto` 和 04 篇讲的 Claude Code auto mode 是同一个思路。几个细节:

- 评估时会考虑调用的输入和会话到目前为止的内容,所以同一个工具的两次调用可能结果不同
- 被 `auto` 拒绝的调用,agent 收到一个错误结果,会话继续运行;**你的客户端不能推翻这个拒绝**
- 拒绝时可以带 `deny_message`,它会作为工具结果交给 agent,让它换个方法
- MCP 工具保持默认的 `always_ask`,除非你明确想减少确认——对第三方服务的调用用 `auto` 意味着它们可能不经你同意就执行

### 4.3 大输出自动落盘

工具输出超过 10 万字符(约 2.5 万 token)时,自动写进容器里的文件,agent 只收到预览和文件路径,需要时再 `read`。不用配置。

---

## 五、凭据:Vault

### 5.1 为什么不能把 key 写进提示词

写在 system prompt 或用户消息里的 key 会永久留在会话的事件历史里,而且容器里运行的任何代码(包括 agent 自己写的、被注入的)都能读到它。

### 5.2 Vault 怎么做

**凭据永远不进入容器**。Anthropic 侧的代理在请求离开容器之后才把凭据加上去:

| 凭据类型 | 匹配方式 | 用途 |
| --- | --- | --- |
| `mcp_oauth` / `static_bearer` | 按 MCP server 的 URL | MCP 工具调用时自动注入;OAuth token 会自动刷新 |
| `environment_variable` | 按变量名 | 容器里只看到一个占位符,请求出容器时在 header 和 body 里替换成真实值。适合 `aws`、`gcloud`、`stripe` 这类 CLI,或者 `curl` 调 API |

```python
vault = client.beta.vaults.create(name="tenant-acme")
client.beta.vaults.credentials.create(vault.id, ...)    # 按类型填 MCP URL 或 secret_name

session = client.beta.sessions.create(agent=AGENT_ID, environment_id=ENV_ID, vault_ids=[vault.id])
```

- agent 的 `mcp_servers` 里只写 `type`、`name`、`url`,**没有认证字段**——这样 agent 配置可以复用,凭据按租户分开
- `vault_ids` 只能在创建会话时指定
- **MCP 的 OAuth token 不等于服务的 REST API key**:Notion 的集成 token 能调 Notion REST API,但不能用作 Notion MCP server 的凭据
- 凭据无效不会阻止会话创建,会以 `session.error` 事件报告
- `environment_variable` 不会替换 URL 路径里的密钥,所以 Slack incoming webhook 这种把密钥放在路径里的接口没法用

这是对提示注入的一道硬防线:即使 agent 被网页里的恶意指令操纵,它也读不到、带不走 vault 里的凭据。

---

## 六、环境与资源

### 6.1 网络

| 策略 | 说明 |
| --- | --- |
| `unrestricted` | 除了一个通用的安全黑名单,完全放开 |
| `limited` | 默认拒绝;通过 `allowed_hosts`、`allow_package_managers`、`allow_mcp_servers` 开口子 |

`limited` 下的几个坑:声明了 MCP server 却没开 `allow_mcp_servers`(也没把域名加进 `allowed_hosts`),创建会话直接 400;要装包必须开 `allow_package_managers`,只把仓库域名加进 `allowed_hosts` 不够;`allowed_hosts` 也会限制 `web_search` / `web_fetch`。

### 6.2 资源

- **文件**:用 Files API 上传,作为 `file` 资源挂载进容器
- **GitHub 仓库**:`github_repository` 资源,clone 到指定路径;git 操作经过一个代理注入 token,token 不进容器
- **输出**:agent 把交付物写到 `/mnt/session/outputs/`,你再通过 Files API 取回
- **memory store**:见第八节

### 6.3 自托管沙箱

数据不能出你的 VPC 时,把 environment 设成 `{"type": "self_hosted"}`:agent 循环仍然在 Anthropic,**工具执行在你的机器上**。你在 Console 里生成环境 key,运行一个 worker(SDK 的 `EnvironmentWorker`,或 `ant beta:worker poll`)去领取工作。代价是容器加固、网络出口、资源挂载都要你自己负责;vault 的 `environment_variable` 凭据也还不支持(出口是你的,没有地方替换)。`web_search` / `web_fetch` 无论哪种环境都在 Anthropic 的服务器上跑。

---

## 七、Outcomes:改到合格为止

如果会话的任务是**一个可以检查的交付物**(一份报告、一个 PR、一个数据集),不要用 `user.message` 开始,用 `user.define_outcome`:

```python
client.beta.sessions.events.send(session_id=session.id, events=[{
    "type": "user.define_outcome",
    "description": "写一份竞品定价报告 report.md",
    "rubric": {"type": "text", "content": """
- 输出是 /mnt/session/outputs/ 下的一个 report.md
- 每个结论都附来源 URL
- 有一张汇总表,每个竞品一行
- 价格注明读取日期和出处
- 没有占位文字、TODO 或空章节
"""},
    "max_iterations": 5,          # 默认 3,最多 20
}])
```

系统会运行"做 → 评 → 改"的循环:一个**独立上下文的评分者**按 rubric 逐条打分,把不达标的地方反馈给 agent,直到满足、达到最大迭代次数或被中断。

- 一次只能有一个 outcome,等上一个结束(`satisfied` / `max_iterations_reached` / `failed` / `interrupted`)再定义下一个
- 不用发"继续"之类的消息,agent 知道要一直做到结束
- rubric 写**可检查的条件**,不要写"质量高""内容全面"

这和 08 篇的 `/goal` 是同一个思路:先说清楚"完成"是什么样子,再让 agent 去做。

---

## 八、Memory Store:跨会话记忆

会话默认是一次性的,结束后 agent 学到的东西就没了。memory store 是工作区级别的一组小文本文件,挂载到会话的容器里,agent 像读写普通文件一样使用它:

```python
store = client.beta.memory_stores.create(
    name="User Preferences",
    description="每个用户的偏好和项目背景。",       # 这段描述是给模型看的
)
client.beta.memory_stores.memories.create(store.id, path="/formatting.md", content="报告一律用 ISO-8601 日期……")

session = client.beta.sessions.create(
    agent=AGENT_ID, environment_id=ENV_ID,
    resources=[{
        "type": "memory_store",
        "memory_store_id": store.id,
        "access": "read_write",                     # 或 "read_only"
        "instructions": "开始任何任务前先看一下用户偏好。",
    }],                                             # 只能在创建会话时挂载
)
```

- 挂载在容器的 `/mnt/memory/<store-name>/`,agent 用普通的文件工具读写,没有专门的记忆工具
- 一个会话最多挂 8 个 store:比如一个只读的共享参考库 + 一个每个用户自己的读写库
- 每次修改生成一个不可变的版本,可以审计、回滚,也可以**删除某个版本里的敏感内容**(redact)
- 单个记忆文件最大 100KB,多用小文件
- 宿主程序也可以直接读写记忆,更新时可以带前置条件做乐观并发控制
- **不要往里存凭据**:记忆会原样出现在之后每个挂载它的会话里

它是 29 篇 memory 工具的托管版:存储、隔离、版本都替你做好了。memory store 用的是另一个 beta 头 `agent-memory-2026-07-22`(SDK 自动设置),**和 `managed-agents-2026-04-01` 一起发会 400**。

---

## 九、定时部署、多 agent 与其他

### 9.1 定时部署

```python
deployment = client.beta.deployments.create(
    name="每周合规扫描",
    agent=AGENT_ID,
    environment_id=ENV_ID,
    initial_events=[{"type": "user.message", "content": [{"type": "text", "text": "执行每周合规扫描"}]}],
    schedule={"type": "cron", "expression": "0 20 * * 5", "timezone": "Asia/Shanghai"},
)
```

每次触发自动创建一个会话。最细到分钟级。交付物类的任务,`initial_events` 里用 `user.define_outcome`。可以暂停、恢复,也可以手动触发一次。这对应 19 篇讲的 Claude Code routines,只是这里你在 API 层面完全掌控。

### 9.2 多 agent

在 agent 上加一个顶层的 `multiagent` 字段,让它成为协调者:

```python
agent = client.beta.agents.create(
    name="Research lead",
    model="claude-opus-5-5",
    system="请求能拆成独立子问题时,每个子问题交给一个副本,最后核对并合并它们的报告。",
    tools=[...],
    multiagent={"type": "coordinator", "agents": [
        {"type": "self"},          # 可以派生自己的副本
        WORKER_AGENT_ID,           # 一个用 Haiku 5.5 的只读研究员
    ]},
)
```

- 所有 agent **共享容器和文件系统**,每个在自己的线程里运行,有独立的上下文
- 只有一层委派,花名册最多 20 个 agent
- 建议从 `{"type": "self"}` 开始,再把阅读量大的工作挪给便宜的模型
- **不适合"一次回答一个问题"的 agent**:问答、客服这类,不需要再加一堆检查者、投票者
- 花名册里还可以放一个 `{"type": "advisor", "model": ...}`(28 篇的 advisor)
- 工作量大到无法一个个分派时(几百份文档),可以开启**动态 workflow**,由 agent 自己写计划、分阶段调度大量子 agent,和 17 篇 Claude Code 的 dynamic workflows 是同一个思路

### 9.3 其他

| 功能 | 说明 |
| --- | --- |
| **会话预算** | 创建时设 `budget={"type": "limit", "max_list_cost": {"amount": "2500", "currency": "USD"}}`(单位是美分,字符串)。到达上限会话暂停在 idle,不会终止;可以调高或去掉预算继续 |
| **Webhook** | 在 Console 里注册,会话状态变化时推送通知,不用一直开着流;要校验 HMAC 签名 |
| **断线重连** | SSE 流没有重放。重连时先打开流,再拉一遍事件列表,按事件 ID 去重。否则如果断线时有待确认的工具调用,会话会一直卡住 |
| **消息排队** | 会话在 running 时也可以发消息,按顺序处理 |
| **会话级覆盖** | 可以只为某个会话覆盖 agent 的配置,或者在 idle 时更新会话的工具和 MCP server,不影响 agent 本身 |
| **数据驻留** | agent 的模型配置可以指定 `inference_geo` |

### 9.4 计费

按模型 token 的标准价格计费,另外加**会话运行时间 $0.08/小时**,网页搜索 $10 / 千次。Batches API 不能用于 Managed Agents。

---

## 十、和 Claude Code 云端会话的关系

19 篇讲的 Claude Code 云端会话和 routines,本质上也是"托管的 agent"。区别在于面向谁:

| | Claude Code 云端会话 / routines | Managed Agents |
| --- | --- | --- |
| 面向 | 开发者自己用 | 你在构建给别人用的产品 |
| 配置方式 | 界面、CLAUDE.md、settings | API 对象,版本化 |
| 工具 | Claude Code 的整套工具 | 预置工具集 + 你的自定义工具 + MCP |
| 多租户 | 不涉及 | vault、memory store、预算按租户分开 |
| 集成 | GitHub、Slack 等现成集成 | 事件流、webhook,嵌进你的系统 |

---

## 十一、踩坑

1. **每次运行都 `agents.create()`**——孤儿 agent 越积越多,版本管理失效。创建一次,存 ID
2. **把 `model`、`system`、`tools` 传给 `sessions.create()`**——它们是 agent 的字段
3. **只写 `{"type": "agent_toolset_20260401"}`**——8 个工具全开,包括联网。显式关掉不需要的
4. **把 API key 写进提示词**——永久留在事件历史里,容器里的代码也能读到。用 vault
5. **先发消息再开流**——早期事件会一次性堆过来。先开流
6. **断线后直接重开流**——没有重放,待确认的工具调用会让会话卡死。重开流 + 拉列表 + 去重
7. **回应工具确认时用了 `toolu_` ID**——要用触发事件的 `sevt_` ID
8. **`limited` 网络下声明了 MCP server 却没放行**——创建会话 400
9. **在 memory store 的调用上加了 `managed-agents-2026-04-01` 头**——两个 beta 头一起发是 400
10. **随手 archive 生产环境的 agent、environment、memory store**——archive 不可逆,新会话再也不能引用它们

---

到这里,第四层「Claude API」结束了。这一层从一次最简单的 `messages.create` 出发:模型矩阵和 SDK,工具调用和结构化输出,prompt 缓存的前缀规则,adaptive thinking 和 effort,文档、Files API 和引用,服务端工具,长对话的上下文管理,成本优化,最后是把整个 agent 托管出去的 Managed Agents。它们是 Claude Code 和一切基于 Claude 的产品的底层。下一层换一个角度:不从 API 开始搭,而是**直接拿 Claude Code 的 agent 循环来用**——Agent SDK。

下一篇:`32-Agent-SDK总览与Agent-Loop.md`,讲 Claude Agent SDK 是什么、和 Messages API 及 Claude Code CLI 的关系、`query()` 的基本用法、agent 循环里发生了什么、消息类型,以及会话的继续和分叉。
