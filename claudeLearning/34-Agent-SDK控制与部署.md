# Agent SDK 控制与部署

在本机跑通一个 SDK agent 很容易,把它放进生产环境就是另一回事了:它会执行 shell 命令、改文件、调外部服务,而触发它的可能是一个你不认识的用户,它读到的可能是一份带着恶意指令的文档。这一篇讲两件事:**怎么管住 agent**(权限判定、审批回调、hooks、结构化输出、文件回滚、成本和可观测性),以及**怎么部署它**(子进程模型、会话存储、多租户隔离、安全加固)。

> 一句话先记住:**一个 SDK 会话就是一个长期运行的 Claude Code 子进程**,它有自己的 shell、工作目录和磁盘上的会话文件。部署它不像部署一个无状态的 API 封装,更像为每个用户开一台小电脑——隔离、资源、凭据、出口,都要按这个思路设计。

---

## 一、权限是怎么判定的

Claude 请求一个工具时,SDK 按这个顺序检查:

```
① Hooks          ── 可以直接拒绝;返回 allow 也不会跳过后面的 deny / ask 规则
② Deny 规则      ── 匹配就拒绝,bypassPermissions 也拦得住
③ Ask 规则       ── 匹配就交给 can_use_tool 回调,bypassPermissions 也一样
④ 权限模式       ── bypassPermissions 放行;acceptEdits 放行文件操作;plan 把写操作送去回调
⑤ Allow 规则     ── 匹配就放行(工作目录内读文件、只读 Bash 命令本身就不需要批准)
⑥ can_use_tool   ── 前面都没决定的,交给你的回调;dontAsk 模式下直接拒绝
```

从这个顺序能推出几条很重要的结论:

- **被前面步骤放行的调用永远到不了 `can_use_tool`**。如果你在回调里做安全检查,而同时又把这个工具写进了 `allowed_tools` 或用了 `acceptEdits`,检查会被静默绕过。要拦截**每一次**调用,用 `PreToolUse` hook
- **`allowed_tools` 不限制 `bypassPermissions`**。`allowed_tools=["Read"]` 配 `bypassPermissions`,没列出的工具照样在第④步被放行
- **要一个锁死的 agent:`allowed_tools` + `permission_mode="dontAsk"`**。列出的放行,其余需要询问的一律拒绝
- 有些操作任何模式都不会自动放行:`AskUserQuestion`、要求用户交互的 MCP 工具、对关键路径的 `rm`(比如 `rm -rf ~`)
- 规则里的路径:`Edit(//secrets/**)` 是文件系统绝对路径;单斜杠 `Edit(/secrets/**)` 相对于规则来源(对 `allowed_tools` 来说是会话的工作目录)。`Edit(...)` 规则覆盖所有写文件的工具,包括 `Write`

这和 03-04 篇讲的 Claude Code 权限系统是同一套,只是 `can_use_tool` 取代了终端里的确认提示。

---

## 二、`can_use_tool`:你的审批界面

```python
from claude_agent_sdk import ClaudeAgentOptions, HookMatcher
from claude_agent_sdk.types import PermissionResultAllow, PermissionResultDeny, ToolPermissionContext

async def can_use_tool(tool_name: str, input_data: dict, context: ToolPermissionContext):
    if tool_name == "AskUserQuestion":
        answers = await ui.ask(input_data["questions"])          # Claude 生成的问题和选项,展示给用户
        return PermissionResultAllow(updated_input={**input_data, "answers": answers})

    if tool_name == "Bash" and input_data["command"].startswith("git push"):
        if not await ui.confirm(f"允许执行:{input_data['command']}?"):
            return PermissionResultDeny(message="用户拒绝推送,请只在本地提交")
    return PermissionResultAllow(updated_input=input_data)

# Python 里 can_use_tool 需要流式输入,并且要注册一个空的 PreToolUse hook 让流保持打开
async def keep_open(input_data, tool_use_id, context):
    return {"continue_": True}

options = ClaudeAgentOptions(
    can_use_tool=can_use_tool,
    hooks={"PreToolUse": [HookMatcher(matcher=None, hooks=[keep_open])]},
)
```

- 回调在两种情况下触发:工具需要批准,以及 Claude 调用 `AskUserQuestion` 提问。如果你用 `tools` 白名单,要把 `AskUserQuestion` 也列进去
- `allow` 时可以**修改输入**(`updated_input`),比如把路径改到沙箱里;`deny` 时的 `message` 会作为工具结果交给 Claude,让它换个做法
- 回调可以一直挂着,执行就一直暂停。用户可能很久才回应(比如等审批邮件),进程又不能一直挂着时,用 `PreToolUse` hook 返回 `defer` 决定,之后再恢复
- 想在需要审批时发 Slack / 邮件通知,用 `PermissionRequest` hook
- `AskUserQuestion` 的问题是 Claude 生成的,你只负责展示和回传答案,不能往这个流程里加你自己的问题

---

## 三、Hooks

11 篇讲过 Claude Code 的 hooks。在 SDK 里,hook 是**你进程里的一个回调函数**,不是 shell 命令(设置文件里的 shell hooks 在对应的 `setting_sources` 启用时也会加载)。

### 3.1 注册

```python
async def protect_env(input_data, tool_use_id, context):
    path = input_data["tool_input"].get("file_path", "")
    if path.endswith(".env"):
        return {"hookSpecificOutput": {
            "hookEventName": input_data["hook_event_name"],
            "permissionDecision": "deny",
            "permissionDecisionReason": "不允许修改 .env 文件",
        }}
    return {}                                     # 空对象 = 不干预

async def audit(input_data, tool_use_id, context):
    await audit_log.write(input_data["tool_name"], input_data["tool_input"], input_data.get("tool_response"))
    return {}

options = ClaudeAgentOptions(hooks={
    "PreToolUse": [HookMatcher(matcher="Write|Edit", hooks=[protect_env])],
    "PostToolUse": [HookMatcher(hooks=[audit])],
})
```

`matcher` 对工具类事件匹配工具名,规则和设置文件里的 matcher 一样;不写就对这类事件全部触发。

### 3.2 能返回什么

| 输出 | 作用 |
| --- | --- |
| `permissionDecision: "deny"` + 原因 | 拦截这次调用,原因交给 Claude |
| `permissionDecision: "allow"` + `updatedInput` | 改写输入后放行(比如把写入路径重定向到 `/sandbox`) |
| `additionalContext` | 给模型补充上下文;在 `PostToolUse` 里会追加到工具结果后面 |
| `updatedToolOutput` | 在 `PostToolUse` 里替换工具输出(比如脱敏)再交给 Claude |
| `systemMessage` | 给**用户**看的提示,模型看不到 |
| `continue_: False`(Python)/ `continue: false` | 停止执行 |

hook 返回 `allow` 不会跳过 deny 和 ask 规则,也不能批准对关键路径的删除。

### 3.3 可用的事件

两个 SDK 都有的:`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`UserPromptSubmit`、`Stop`、`SubagentStart`、`SubagentStop`、`PreCompact`、`PermissionRequest`、`Notification`。

TypeScript 独有的还有很多:`SessionStart` / `SessionEnd`、`PostToolBatch`、`PostCompact`、`PermissionDenied`、`PreModelSwitch` / `PostModelSwitch`、`TaskCreated` / `TaskCompleted`、`Elicitation`、`InstructionsLoaded`、`FileChanged` 等。需要会话级的生命周期 hook,目前得用 TypeScript。

---

## 四、结构化输出

agent 可以用任何工具完成任务,最后再按你的 schema 交回一个经过校验的 JSON:

```python
from pydantic import BaseModel

class ReviewResult(BaseModel):
    summary: str
    issues: list[dict]          # [{file, line, severity, message}]
    approve: bool

async for message in query(
    prompt="审查 src/auth/ 下的改动",
    options=ClaudeAgentOptions(
        allowed_tools=["Read", "Grep", "Glob"],
        output_format={"type": "json_schema", "schema": ReviewResult.model_json_schema()},
    ),
):
    if isinstance(message, ResultMessage):
        if message.subtype == "success" and message.structured_output:
            result = ReviewResult.model_validate(message.structured_output)
        elif message.subtype == "error_max_structured_output_retries":
            ...   # 多次尝试都没产出合法的 JSON
```

TypeScript 用 `outputFormat` 和 Zod(`z.toJSONSchema()` 生成 schema,`safeParse` 解析)。结果在 `ResultMessage.structured_output` 里,而不是 `result` 文本里。这是把 agent 接进流水线的关键:35 篇的 PR 审查 agent 就靠它输出可以直接贴到 GitHub 的评论。

---

## 五、文件检查点:回滚 agent 的改动

32 篇说过,会话保存的是对话,不是文件。要能撤销 agent 对文件的修改,开启文件检查点:

```python
options = ClaudeAgentOptions(
    enable_file_checkpointing=True,
    permission_mode="acceptEdits",
    extra_args={"replay-user-messages": None},     # 让流里的用户消息带上检查点 UUID
)

async with ClaudeSDKClient(options) as client:
    await client.query("重构认证模块")
    async for m in client.receive_response():
        if isinstance(m, UserMessage) and m.uuid and not checkpoint_id:
            checkpoint_id = m.uuid                 # 第一个检查点 = 改动之前
        if isinstance(m, ResultMessage):
            session_id = m.session_id

# 之后:恢复会话,回滚文件
async with ClaudeSDKClient(ClaudeAgentOptions(enable_file_checkpointing=True, resume=session_id)) as client:
    await client.query("")
    async for _ in client.receive_response():
        await client.rewind_files(checkpoint_id)
        break
```

限制要清楚:

- **只跟踪 `Write`、`Edit`、`NotebookEdit` 的改动**。`Bash` 里的 `sed -i`、`echo > file` 不跟踪,子 agent 的改动也不跟踪
- 回滚只恢复文件,**不回滚对话**
- 回滚时,agent 新建的文件会被删除,修改过的恢复原样

对生产环境来说,更可靠的做法往往是**在 git 工作树或一次性容器里运行 agent**,用 git 本身做回滚;检查点适合"用户点一下撤销"这类交互场景。这和 05 篇 Claude Code 的检查点、16 篇的 worktree 是同一个思路。

---

## 六、成本与可观测性

### 6.1 成本

- `ResultMessage.total_cost_usd`:这次 query 的估算总花费,包括子 agent
- `model_usage`(TS:`modelUsage`):按模型拆分的用量,子 agent 用了别的模型时看这里
- 失败的会话也有成本字段,照样记账;会话崩溃时成本字段可能是 0,需要从记录里恢复
- 多次调用要自己累加;同一回应的多条 `AssistantMessage` 共享消息 ID,按 ID 去重,不要重复计算

### 6.2 OpenTelemetry

```python
OTEL_ENV = {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA": "1",           # traces 需要;metrics 和 logs 不需要
    "OTEL_TRACES_EXPORTER": "otlp",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.internal:4318",
}
options = ClaudeAgentOptions(env=OTEL_ENV)
```

导出的 trace 能看到每一轮模型请求、每一次工具调用。可以打上你自己的标签(租户、请求 ID)把 trace 和应用关联起来,也可以控制导出里是否包含提示词和工具内容等敏感数据。短命的调用结束前要等遥测刷新完。42 篇会讲团队层面的用量监控。

---

## 七、部署:子进程模型

### 7.1 每个会话一个子进程

调用 `query()` 时,SDK 启动一个 `claude` 子进程,通过 stdio 通信。这个子进程拥有 shell、工作目录和会话记录文件。**N 个并发会话就是 N 个子进程**,默认都继承你应用的工作目录——需要隔离时,每次调用都显式传 `cwd`。

本地磁盘上的三类状态,容器重启、缩容、换节点都会丢:

| 状态 | 默认位置 |
| --- | --- |
| 会话记录 | `~/.claude/projects/`(或 `CLAUDE_CONFIG_DIR` 下的 `projects/`) |
| CLAUDE.md 记忆文件 | `~/.claude/CLAUDE.md` 和工作目录 |
| 工作目录里的产物 | 会话的工作目录 |

### 7.2 四种会话模式

| 模式 | 容器生命周期 | 适合 |
| --- | --- | --- |
| **临时** | 每个任务一个容器,做完销毁 | 一次性任务:修 bug、抽取发票、翻译文档 |
| **长期运行** | 常驻容器,一个容器跑多个会话 | 自主运行的 agent、高频消息流(邮件分拣、Slack 机器人) |
| **混合** | 临时容器,启动时从 `SessionStore` 恢复,结束时写回 | 跨很多次交互、中间长时间空闲(个人项目助理、几小时的深度研究) |
| **多 agent 容器** | 一个容器里多个 agent 协作 | 需要共享文件系统的协作 |

长期运行模式下,TypeScript 用 `streamInput()` 给活跃会话追加消息、用 `startup()` 预热子进程;Python 用 `ClaudeSDKClient` 保持会话打开。

### 7.3 资源和网络

- 起步配置:**每个 agent 1 GiB 内存、5 GiB 磁盘、1 CPU**。内存随会话长度和工具活动增长,按实际的会话长度和并发量来定
- 出站要能访问 `api.anthropic.com`(或云平台的区域端点),以及 agent 用到的 MCP server 和外部服务
- 入站由你的应用暴露 HTTP / WebSocket 端口,子进程本身不监听网络
- 运行环境里要有 agent 会用到的命令行工具(git、node、python 等)

### 7.4 会话存储

跨主机、无状态容器、serverless 里恢复会话,需要一个 `SessionStore` 适配器,把会话记录同步到你的存储:

```typescript
type SessionStore = {
  append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void>;   // 必须
  load(key: SessionKey): Promise<SessionStoreEntry[] | null>;             // 必须
  listSessions?(projectKey: string): Promise<Array<{ sessionId: string; mtime: number }>>;
  // ……还有几个可选方法
};
```

- SDK 自带 `InMemorySessionStore` 用于开发测试;两个 SDK 仓库里有 S3、Redis、Postgres 的参考实现
- 本地文件和存储是**双写**的,写存储是尽力而为
- **只同步会话记录**,CLAUDE.md 和工作目录里的文件要另外用共享卷或对象存储同步
- 混合模式下这个存储是必需的:没有它,容器一关会话就没了

---

## 八、多租户隔离

默认情况下 SDK 会读取文件系统里的配置和 CLAUDE.md。一个容器服务多个租户时,这些文件会让一个租户的上下文泄露到另一个租户的会话里:

```python
options = ClaudeAgentOptions(
    cwd=tenant_dir,                                 # 每个租户自己的工作目录
    setting_sources=[],                             # 不读 user / project / local 配置
    env={
        "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1",     # auto memory 不受 setting_sources 控制,要单独关
        "CLAUDE_CONFIG_DIR": tenant_config_dir,     # 每个租户自己的全局配置目录
    },
)
```

再加上**在代理上按租户设置出口规则**(不同的出口 IP、凭据、域名白名单),防止一个被攻破的租户借用别人的出口带走数据。隔离要求更高时,每个租户一个容器。

---

## 九、安全加固

### 9.1 威胁模型

agent 可能因为**提示注入**(它处理的内容里嵌着指令)或**模型失误**做出意料之外的事。模型本身有防御,但纵深防御仍然必要:比如 agent 读到一个恶意文件,要它把客户数据发到外部服务器——网络控制能直接拦掉这个请求。

### 9.2 原则

| 资源 | 最小权限 |
| --- | --- |
| 文件系统 | 只挂载需要的目录,尽量只读 |
| 网络 | 通过代理限制到指定的端点 |
| 凭据 | 通过代理注入,不直接暴露给 agent |
| 系统能力 | 容器里去掉不需要的 Linux capabilities |

### 9.3 凭据走代理

**推荐的做法是在 agent 的安全边界之外跑一个代理**,由它给出站请求加上凭据:agent 发出不带凭据的请求,代理加上凭据再转发。好处:agent 永远看不到凭据;代理可以做端点白名单;所有请求都有审计日志;凭据集中存放。对 Anthropic API 本身的请求,可以用 `ANTHROPIC_BASE_URL` 指向你的代理。

其他服务的凭据,要么做成自定义工具(凭据留在你的进程里,agent 只能通过工具间接使用),要么通过流量转发让代理注入。这和 31 篇 Managed Agents 的 vault 是同一个思想:**凭据不进入 agent 能读到的地方**。

### 9.4 隔离技术

从轻到重:Claude Code 自带的沙箱运行时(04 篇)→ 容器(去掉 capabilities、只读根文件系统、非 root 用户)→ gVisor → 虚拟机(Firecracker 等)。代码以只读方式挂载,只给 agent 一个可写的工作目录。

---

## 十、已知限制

| 限制 | 对策 |
| --- | --- |
| 会话没有整体超时 | 用 `max_turns` 限制来回次数,用 `max_budget_usd` 限制花费 |
| 长会话内存持续增长 | 限制会话长度,或定期回收子进程 |
| 大量并行子 agent 会撞上限流 | 分批派发,不要一次铺开 |
| 子 agent 没有单独的总时长限制 | 在 `AgentDefinition` 里设 `maxTurns` |

---

## 十一、踩坑

1. **在 `can_use_tool` 里做安全检查,却把那个工具写进了 `allowed_tools`**——自动放行的调用到不了回调,检查被静默绕过。用 `PreToolUse` hook
2. **以为 `allowed_tools` 能限制 `bypassPermissions`**——没列出的工具照样放行,锁死用 `dontAsk`
3. **Python 里用 `can_use_tool` 但 prompt 传的是字符串**——需要流式输入加一个空的 `PreToolUse` hook
4. **以为文件检查点能回滚 `Bash` 改的文件**——只跟踪 `Write` / `Edit` / `NotebookEdit`
5. **把 SDK 当无状态服务部署在 serverless 上,不配 `SessionStore`**——实例一回收,会话就没了
6. **多租户共用一个容器却没关 auto memory**——它不受 `setting_sources` 控制,会跨租户泄露
7. **所有会话共用应用的工作目录**——互相覆盖文件。每次调用传 `cwd`
8. **把 API key 直接放进 agent 的环境变量**——agent 执行的任何命令都能读到。用代理注入
9. **结构化输出从 `result` 文本里解析**——结果在 `structured_output` 字段里
10. **不设 `max_turns` 就上线**——会话没有自己的超时,开放式任务可能一直跑

---

下一篇:`35-实战-PR审查Agent.md`,把这一层的内容串起来,从零做一个 PR 审查 agent:只读权限、子 agent 分工、结构化输出、hooks 审计,最后接进 GitHub Actions。
