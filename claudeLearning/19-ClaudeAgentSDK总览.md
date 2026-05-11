# Claude Agent SDK 总览

13 篇讲过 tool loop——你能自己写 Agent 主循环了。但当 Agent 要做的事多了之后(权限管理、subagent、context compaction、文件 IO、bash 沙箱、MCP 集成、hooks……),你会发现自己在重新发明 Claude Code。**Anthropic 干脆把 Claude Code 的内核开源出来,叫 Claude Agent SDK**——你拿到的就是 Claude Code 同款的"Agent 引擎",上面拼业务就行。

> 一句话先记住:**Claude Agent SDK = Claude Code 的内核 + 一套你可以接管 / 替换的 hook 点**。它不只是"对 Anthropic API 的封装"——是一个**完整的 Coding Agent 运行时**,直接产品化能用。

---

## 一、为什么不用 LangChain / LlamaIndex / 自己撸

aiLearning/31 讲过框架选型。这里收窄到 Claude 生态:

| 维度 | 自己用 Anthropic SDK | LangChain | Claude Agent SDK |
| --- | --- | --- | --- |
| Tool loop | 自己写 | 抽象层 | 内置 |
| Subagent | 自己派 | 复杂 | 内置(`Task` 工具) |
| Context compaction | 自己截 | 部分支持 | 内置自动 |
| 文件 / bash 沙箱 | 自己写 | 不擅长 | 内置且生产级 |
| 权限模型 | 自己写 | 自己写 | 内置 allow/deny/ask + callback |
| MCP 集成 | 自己接 | 第三方插件 | 一等公民 |
| Hook 系统 | 自己写 | 自己写 | 内置 |
| 模型生态 | 全家桶 | 全家桶 | **只 Claude** |
| 跨 session 一致 | 自己 | 不一致 | 跟 Claude Code 完全一致 |

**选 Agent SDK 的场景**:

- 你要写一个**Coding Agent / IDE 助手 / 内部工具 Agent**——基本就是 Claude Code 的变体
- 你的 Agent 主要靠 **Claude 模型**(不需要切到 GPT / 开源)
- 你希望产物**和 Claude Code 行为一致**(同样的 hook、同样的 subagent)

**不选的场景**:

- 你要支持多家模型(LangChain / LiteLLM 更合适)
- 你的 Agent 是"工作流编排"为主而非"Coding"(LangGraph 更合适)
- 你已经有 LangChain 重投入(继续 LangChain 也行)

---

## 二、装上,跑一个 Hello Agent

Python:

```bash
pip install claude-agent-sdk
```

```python
import asyncio
from claude_agent_sdk import query

async def main():
    async for msg in query(prompt="把 README.md 翻译成英文"):
        print(msg)

asyncio.run(main())
```

TypeScript:

```bash
npm i @anthropic-ai/claude-agent-sdk
```

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const msg of query({ prompt: "Translate README.md to English" })) {
  console.log(msg);
}
```

跑一下,这个**就是一个能读文件、改文件、跑命令的完整 Coding Agent**——它行为和 Claude Code 几乎完全一致(因为底层就是同一个内核)。

---

## 三、Agent SDK 的核心心智

```
┌────────────────────────────────────────────────────┐
│           你的应用代码(业务层)                      │
│  - 提供 prompt                                      │
│  - 注册自定义 tool / subagent / hook                │
│  - 实现 permission callback                         │
└──────────────┬─────────────────────────────────────┘
               │
        ┌──────▼──────┐
        │  Agent SDK   │  ← Claude Code 的内核
        │  (主循环)    │
        └──────┬──────┘
               │
   ┌───────────┼───────────────┐
   ▼           ▼               ▼
[内置工具]  [你注册的 tool]  [MCP server]
 Read/Edit/   custom tools    GitHub/DB/...
 Bash/...
```

**你只关心三件事**:

1. **业务 prompt**(让它干啥)
2. **可选注册**:custom tool / subagent / hook / permission callback
3. **接结果 / 流式展示**

剩下的(tool 调度、context 管理、subagent 派发、compaction)SDK 全管。

---

## 四、关键 API 速览

```python
from claude_agent_sdk import query, ClaudeAgentOptions

async for msg in query(
    prompt="...",
    options=ClaudeAgentOptions(
        model="claude-sonnet-4-7",
        system_prompt="You are a careful coding assistant...",
        cwd="/path/to/project",
        allowed_tools=["Read", "Edit", "Bash"],
        permission_mode="acceptEdits",
        permission_prompt_callback=my_permission_handler,
        mcp_servers={...},
        custom_tools=[...],
        subagents=[...],
        hooks={...},
        max_turns=50,
    )
):
    print(msg)
```

字段对应 Claude Code 的 settings.json,**你看着就熟悉**——同一套配置体系,从 CLI 平移到 SDK。

---

## 五、和 Claude Code 共享的概念

| Claude Code 概念 | Agent SDK 对应 |
| --- | --- |
| `~/.claude/CLAUDE.md` | `system_prompt` 或 `setting_sources` |
| `.claude/settings.json` permissions | `allowed_tools` / `permission_prompt_callback` |
| `.claude/agents/xxx.md` | `subagents` 参数 |
| `.claude/skills/` | `setting_sources` 加载 |
| `.mcp.json` | `mcp_servers` 参数 |
| `hooks` 字段 | `hooks` 参数 |
| `--permission-mode plan` | `permission_mode="plan"` |

**结论**:**写过 Claude Code 配置就会用 Agent SDK**——没有新心智。

---

## 六、Agent SDK 的两种用法

### 6.1 跑完即弃(Single query)

最常见——给一个 prompt,Agent 跑完返回结果。

```python
async def review_pr(pr_number: int) -> str:
    result_text = ""
    async for msg in query(
        prompt=f"Review PR #{pr_number} 关注 ..."
    ):
        if msg.type == "text":
            result_text += msg.text
    return result_text
```

适合:CI 任务、API 服务后端、定时任务。

### 6.2 持续 session(Streaming)

像 Claude Code 一样保持长 session,用户/系统持续发新 prompt。

```python
async with create_agent_session() as session:
    response1 = await session.send("先看下项目结构")
    response2 = await session.send("现在加一个 dark mode")
    # session 维护 context 跨多轮
```

适合:IDE 集成、聊天 UI、长任务 daemon。

---

## 七、Agent SDK 的可扩展点

后面 4 篇会逐个展开,这里先列出全景:

| 扩展点 | 干什么 | 哪一篇讲 |
| --- | --- | --- |
| **Custom Tool** | 注册一个你自己的工具(代码) | 21 |
| **Subagent** | 派子 agent 跑独立子任务 | 21 |
| **Hook** | 生命周期钩子(PreToolUse / PostToolUse / 等) | 22 |
| **Permission Callback** | 每次 tool 调用前问自己业务逻辑 | 22 |
| **MCP Server** | 接外部工具协议 | 接 24-27 |
| **Compaction** | 长任务 context 自动压缩 | 22 |
| **Setting Sources** | 加载 CLAUDE.md / skills / hooks 等文件 | 22 |

---

## 八、与 Anthropic API 的关系

Agent SDK 内部用 Anthropic API。**所以**:

- prompt caching 自动开启(SDK 内部用对策略)
- streaming 内置
- thinking 可以打开
- 模型选择走 `model=` 参数
- 计费仍然在 Anthropic 账户

> 你**不会**在 Agent SDK 之外多付钱;Agent SDK 不是付费产品,是开源 SDK,用法上 = Anthropic SDK 的"高级版"。

---

## 九、Agent SDK 的典型用例

### 9.1 写一个内部 PR review agent

```
Agent SDK + GitHub MCP + 自定义 review checklist subagent
→ CI 触发 → review PR → 留 comment
```

### 9.2 客服 Agent 升级版

普通 Agent 只能用 tools 查知识库。Agent SDK 能让客服 Agent:
- 读用户工单(MCP)
- 查后台 DB(MCP)
- 写工单备注(custom tool)
- 调内部脚本(bash)
- 长会话不爆(自动 compaction)

### 9.3 数据探索 Agent

业务分析师对话式问数据,Agent 能:
- 跑 SQL(MCP)
- 算 Python(code execution tool)
- 画图(matplotlib + 输出到 file)
- 维持 session 内多轮探索

### 9.4 你公司专属的 IDE 助手

打包 Agent SDK + 公司 MCP servers + 公司 skill,**做成一个"为公司定制的 Claude Code"**——和官方 Claude Code 差异只在"公司专属 hook 和 MCP"。

---

## 十、什么时候**不**用 Agent SDK

- **简单单步任务**:用 Anthropic SDK 直接调,Agent SDK 是杀鸡用牛刀
- **多模型混合**:LiteLLM / OpenRouter / LangChain
- **不需要工具调用,只是聊天**:Anthropic SDK
- **极致定制 Agent 行为**(自己改 tool loop):Agent SDK 的硬抽象不一定让步,可能要回退到自己写

---

## 十一、踩坑

1. **当 LangChain 替代品**——Agent SDK 强项是"和 Claude Code 一致的内核",不是"通用 LLM 编排"
2. **不读 Claude Code 文档就上 Agent SDK**——配置体系完全一致,先用 CLI 的 Claude Code 摸熟,再上 SDK 顺
3. **以为它和 Anthropic SDK 等价**——它是上层产品,不是 SDK 替代;**Anthropic SDK 仍然是更底层的依赖**
4. **不打开 streaming**——SDK 默认就是 streaming 心智,你硬要 sync 模式只会更难写
5. **不考虑权限 callback**——生产应用必须实现 permission_prompt_callback 拦危险操作;**别只用默认 allow/deny 配置**
6. **不写自定义 tool 全靠内置**——内置工具是 Coding 取向,业务工具该自己写
7. **subagent 滥用**——什么都派 subagent,主 Agent 反而失控;**只在"独立长任务"时派**
8. **没设 max_turns**——长任务可能跑到死循环
9. **生产没监控 token usage**——和 Claude Code 一样,SDK 也要 `/cost` 心智的监控
10. **以为 Agent SDK 就完成全部**——业务 prompt / skill / 工具仍然是你设计的;**SDK 是引擎不是产品**

---

下一篇:`20-AgentLoop内部机制.md`,讲 Agent SDK 内部主循环到底干什么、Anthropic prompt 怎么组装、context compaction 触发条件、permission callback 时序图。
