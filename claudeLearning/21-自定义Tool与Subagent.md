# 自定义 Tool 与 Subagent

Agent SDK 的内置工具(Read / Edit / Bash / 等)只解决"通用 Coding"的事。一旦要做业务,你都要给 Agent 装上**业务工具**——查公司内部 DB、调内部 API、跑业务脚本。这一篇讲两件事:**怎么把自己的 Python / TS 函数注册成 tool**、**怎么定义 subagent**。

> 一句话先记住:**custom tool 让 Agent 能调你的代码;subagent 让 Agent 能派 fork 跑独立子任务**。custom tool 是"加技能",subagent 是"加副手"。

---

## 一、最小 custom tool

Python:

```python
from claude_agent_sdk import query, ClaudeAgentOptions, tool

@tool(
    name="get_user_info",
    description="按 user_id 查用户信息(姓名、邮箱、注册时间)",
    input_schema={
        "type": "object",
        "properties": {
            "user_id": {"type": "string", "description": "用户 UUID"}
        },
        "required": ["user_id"],
    },
)
async def get_user_info(args: dict, context):
    uid = args["user_id"]
    user = await db.users.get(uid)
    if not user:
        return {"content": [{"type": "text", "text": "用户不存在"}], "is_error": True}
    return {
        "content": [{
            "type": "text",
            "text": f"姓名: {user.name}\n邮箱: {user.email}\n注册: {user.created_at}",
        }],
    }

async for msg in query(
    prompt="查一下 user_id=abc-123 的信息",
    options=ClaudeAgentOptions(custom_tools=[get_user_info]),
):
    print(msg)
```

TS:

```ts
import { query, tool } from "@anthropic-ai/claude-agent-sdk";

const getUserInfo = tool({
  name: "get_user_info",
  description: "按 user_id 查用户信息",
  input_schema: {
    type: "object",
    properties: {
      user_id: { type: "string" },
    },
    required: ["user_id"],
  },
  async execute({ user_id }) {
    const user = await db.users.get(user_id);
    if (!user) {
      return { content: [{ type: "text", text: "user not found" }], is_error: true };
    }
    return {
      content: [{ type: "text", text: `${user.name} / ${user.email}` }],
    };
  },
});

for await (const msg of query({
  prompt: "查 user abc-123",
  options: { customTools: [getUserInfo] },
})) {
  console.log(msg);
}
```

**关键**:

- description / input_schema 跟 Anthropic API tool 完全一样的写法
- execute 函数接受 `args` + `context`,返回 `content` block list
- error 用 `is_error: true`
- LLM 看到这个 tool 后会按 description 自己决定是否调

---

## 二、Tool 返回值的格式

```python
return {
    "content": [
        # 多种 block:
        {"type": "text", "text": "..."},
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "..."}},
    ],
    "is_error": False,    # 可选
}
```

**返回值能含图**——这是为什么 computer_use 的 screenshot 工具能让 LLM 看到屏幕。**业务工具也能用**:画个图、生成报表截图、生成 QR code,LLM 直接看。

---

## 三、Tool 的 context 参数

execute 函数第二个参数 `context` 提供运行时信息:

```python
async def my_tool(args, context):
    print(context.session_id)        # 当前 session
    print(context.cwd)               # 当前 cwd
    print(context.user_id)           # 你应用层的 user(自己注入)
    # context.transcript_path 等等
```

**生产里常用**:

- 按 user_id 做权限检查(业务级 RBAC)
- 按 session_id 做 audit log
- 按 cwd 限制文件读写范围

---

## 四、设计 custom tool 的几条原则

### 4.1 input_schema 越严越好

LLM 按 schema 填参数,**严格的 schema = 错率低**:

```python
"input_schema": {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["create", "update", "delete"]},
        "amount": {"type": "number", "minimum": 0, "maximum": 10000},
        "currency": {"type": "string", "pattern": "^[A-Z]{3}$"},
    },
    "required": ["action", "amount", "currency"],
}
```

### 4.2 description 写"何时用"和"何时不用"

```
description: |
  按 user_id 查用户基本信息(姓名 / 邮箱 / 注册时间)。
  仅对登录态用户有效。
  不返回:订单 / 支付历史 / 个人地址(用 get_user_orders 等专用 tool)。
```

### 4.3 一个 tool 一件事

不要写"万能 tool":`do_user_stuff(action, ...)`——LLM 会乱选 action。**拆开写**:`get_user / update_user / delete_user`。LLM 看 description 选哪个干净。

### 4.4 副作用类必须 dry_run / confirm

```python
@tool(
    name="delete_user",
    description="删除用户。**破坏性操作**,需 confirm=true 才执行;否则只 dry_run。",
)
async def delete_user(args, context):
    if not args.get("confirm"):
        # dry run:返回会发生什么,不真删
        return {"content": [{"type": "text", "text": f"[DRY RUN] 会删除 user {args['user_id']}"}]}
    ...真删
```

LLM 第一次调通常没 confirm,你返回 dry_run 给它,它**会问用户**确认才再调一次带 confirm=true。

### 4.5 输出别太长

Tool 返回 50K 文本会把 context 撑爆。**主动截断 / 分页**:

```python
@tool(name="search_logs", description="搜日志,默认返回最多 50 条")
async def search_logs(args, context):
    pattern = args["pattern"]
    limit = min(args.get("limit", 50), 200)
    rows = await loki.query(pattern, limit=limit)
    text = "\n".join(rows[:limit])
    if len(rows) > limit:
        text += f"\n\n[截断,还有 {len(rows) - limit} 行未显示;用 'limit' 参数加大]"
    return {"content": [{"type": "text", "text": text}]}
```

---

## 五、Tool 的并行行为

Anthropic API 默认会并行调多个 tool。SDK 用 `asyncio.gather` / `Promise.all` 并行执行你的 execute。**所以**:

- execute 用 async 写
- 别假设 tool 顺序执行(可能 5 个一起跑)
- 共享资源(DB connection)用 connection pool

---

## 六、Subagent:派一个 fork 跑子任务

Subagent 在 Agent SDK 里用 `subagents=` 参数定义:

```python
options = ClaudeAgentOptions(
    subagents=[
        {
            "name": "explore",
            "description": "派此 agent 做只读探索 / 找代码,不会改文件",
            "tools": ["Read", "Glob", "Grep", "Bash"],   # 只读
            "model": "claude-haiku-4-5",                 # 用便宜模型省钱
            "system_prompt": "你是只读探索 agent...",
        },
        {
            "name": "security-auditor",
            "description": "审查代码安全风险时调用",
            "tools": ["Read", "Grep", "Bash"],
            "model": "claude-opus-4-7",                  # 难任务用 Opus
            "system_prompt": "你是安全审查专家...",
        },
    ],
)
```

主 Agent 看到 `Task` 工具(SDK 内置),subagent_type 可选 `explore` / `security-auditor`,主 Agent 自己决定派哪个。

---

## 七、Subagent vs Custom Tool 怎么选

| 场景 | 选哪个 |
| --- | --- |
| 调一个外部 API / 查 DB | **custom tool**(原子操作) |
| 跑一个完整探索任务,要多步推理 | **subagent**(独立 fork) |
| 简单计算 / 转换 | custom tool |
| 在 monorepo 里搜代码 + 总结 | subagent(用 Explore 子) |
| 单步发邮件 | tool |
| 写一份 PR review 报告 | subagent |

**经验**:

- 单步 / 原子 → tool
- 多步 / 探索 / 决策 → subagent

---

## 八、组合用法:custom tool + MCP + subagent

实际生产 Agent 这三种叠加用:

```python
options = ClaudeAgentOptions(
    # MCP servers:外部系统(GitHub / DB / Slack)
    mcp_servers={
        "github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"]},
    },
    # Custom tools:业务原子操作
    custom_tools=[get_user_info, update_user_tier, send_email],
    # Subagents:复杂子任务
    subagents=[
        {"name": "explore", "description": "...", "tools": [...]},
        {"name": "review", "description": "...", "tools": [...]},
    ],
    permission_prompt_callback=my_permission,
)
```

**层次清晰**:

- MCP = 通用平台能力
- custom tool = 业务原子操作
- subagent = 复杂多步子任务

---

## 九、典型例子:客服 Agent

需求:用户进来 → 查工单 → 看历史 → 给方案 → 必要时升级到人工。

```python
@tool(name="get_ticket", description="按 ticket_id 查工单详情")
async def get_ticket(args, context): ...

@tool(name="get_user_history", description="查用户历史工单 / 订单")
async def get_user_history(args, context): ...

@tool(name="reply_ticket", description="给工单回复(纯文本)")
async def reply_ticket(args, context): ...

@tool(
    name="escalate_to_human",
    description="升级给人工客服,**仅在自动化解决不了时使用**",
)
async def escalate(args, context): ...

options = ClaudeAgentOptions(
    custom_tools=[get_ticket, get_user_history, reply_ticket, escalate],
    subagents=[
        {
            "name": "kb-searcher",
            "description": "在公司知识库里查相关解答",
            "tools": ["Grep", "Glob", "Read"],
            "model": "claude-haiku-4-5",
            "system_prompt": "查内部知识库 docs/...",
        }
    ],
    system_prompt="你是客服 Agent。先查工单,再 kb-searcher 找方案,自动化解决不了再 escalate。",
    permission_prompt_callback=my_permission,
    max_turns=20,
)

async for msg in query(prompt=f"处理 ticket #{ticket_id}", options=options):
    ...
```

**这就是一个 prod 级客服 Agent 雏形**——50 行代码,能力齐全。

---

## 十、踩坑

1. **schema 太宽**——`type: string` 不带 enum 让 LLM 自由发挥,业务 fail
2. **tool description 太短**——LLM 不知道何时调,调错或不调
3. **副作用 tool 没 dry_run**——LLM 一调真删数据
4. **execute 没 async 写**——主循环并行 tool 时全部串行,慢
5. **返回 50K 文本**——直接把 context 撑爆,LLM 后面变傻
6. **subagent 用 Opus 干小活**——贵 5x 没必要;**简单子任务 Haiku**
7. **subagent description 写得像广告**——LLM 不知道何时调;**写"什么场景调我"具体场景**
8. **custom tool 不写 is_error**——LLM 看到错误内容不知道是错误,继续推理;**显式 is_error: true**
9. **不利用 context 做权限**——所有 user 共享一套 tool,有权限漏洞
10. **MCP / custom tool / subagent 重复**——三种地方都暴露"查用户",LLM 选哪个看心情;**避免重复**

---

下一篇:`22-长任务与Compaction.md`,讲 200K context 不够用怎么办、auto-compaction 触发、checkpointing 模式、长任务断点续跑。
