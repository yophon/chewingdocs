# Agent SDK 总览与 Agent Loop

第四层讲的是从 Messages API 开始自己搭:工具要自己定义、自己执行,循环要自己写。但很多时候你想要的其实就是"一个 Claude Code",只不过要嵌进自己的程序里:CI 里自动修 lint、内部平台上的代码迁移助手、一个按公司规范审查 PR 的机器人。**Claude Agent SDK 就是把 Claude Code 做成一个库**:同样的内置工具、同样的 agent 循环、同样的权限系统和上下文管理,用 Python 或 TypeScript 调用。

> 一句话先记住:**Agent SDK 不是 Messages API 的封装,而是 Claude Code 本身**。它在你的进程里启动 Claude Code 的二进制,工具在你的机器上执行,读写的是你的文件系统。你不用实现 `Read`、`Edit`、`Bash`,但你要像对待 Claude Code 一样认真对待它的权限。

Agent SDK 以前叫 Claude Code SDK,改名是因为它能做的远不止写代码。

---

## 一、它在哪个位置

| 你想要 | 用什么 | 得到什么 |
| --- | --- | --- |
| 在终端里交互式开发、跑一次性任务 | Claude Code CLI | 终端界面 |
| 在自己的 Python / TS 程序里嵌入 Claude Code 的 agent,运行在你管理的进程里 | **Agent SDK** | 一个运行 Claude Code 二进制的库:内置工具、权限、会话、hooks |
| 直接调 Claude API | Client SDK(`anthropic`) | API 的直接访问,循环自己写或用 Tool Runner(23-24 篇) |
| 让 Anthropic 托管 agent | Managed Agents(31 篇) | 托管的循环 + 托管的沙箱 |

其他语言想用同一个循环,可以把 CLI 当子进程跑:`claude -p "..." --output-format json`(18 篇)。

**和 Managed Agents 的根本区别**:Agent SDK 的工具在**你的**进程、**你的**机器上执行;Managed Agents 的工具在 Anthropic 为每个会话准备的容器里执行。前者让你直接操作本地仓库、内网服务,后者让你不用管执行环境。

---

## 二、安装与认证

```bash
pip install claude-agent-sdk                 # Python 3.10+
npm install @anthropic-ai/claude-agent-sdk   # Node.js 18+
```

两个 SDK 都**自带了对应平台的 Claude Code 原生二进制**,一般不用另外装 Claude Code。例外:pip 装了源码包而不是平台 wheel(比如 ARM64 Windows),或者 npm 安装时跳过了 optional 依赖(`npm ci --omit=optional`)——这时要另外安装 Claude Code,SDK 会在 `PATH` 里找它。

认证:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

- SDK **不会自动读取 `.env` 文件**,需要的话自己用 dotenv 加载
- 走云平台:`CLAUDE_CODE_USE_BEDROCK=1`、`CLAUDE_CODE_USE_VERTEX=1`、`CLAUDE_CODE_USE_FOUNDRY=1`,或者 `CLAUDE_CODE_USE_ANTHROPIC_AWS=1` 加 `ANTHROPIC_AWS_WORKSPACE_ID`,再配置对应的云凭据
- **第三方产品不能让用户用 claude.ai 账号登录、使用订阅额度**,除非事先获得批准。你的产品要用 API key

品牌上也有规矩:可以叫 "Claude Agent"、"XX Powered by Claude",**不能叫 "Claude Code"**,也不能模仿 Claude Code 的界面元素。

---

## 三、第一个 agent

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, ResultMessage, TextBlock, ToolUseBlock

async def main():
    async for message in query(
        prompt="检查 utils.py 里会导致崩溃的 bug,找到就修掉。",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Edit", "Glob"],
            permission_mode="acceptEdits",
        ),
    ):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    print(block.text)
                elif isinstance(block, ToolUseBlock):
                    print(f"[工具] {block.name}")
        elif isinstance(message, ResultMessage):
            print(f"结束:{message.subtype},花费 ${message.total_cost_usd or 0:.4f}")

asyncio.run(main())
```

TypeScript 写法几乎一样:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "检查 utils.py 里会导致崩溃的 bug,找到就修掉。",
  options: { allowedTools: ["Read", "Edit", "Glob"], permissionMode: "acceptEdits" },
})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {      // 注意是 message.message.content
      if (block.type === "text") console.log(block.text);
      else if (block.type === "tool_use") console.log(`[工具] ${block.name}`);
    }
  } else if (message.type === "result") {
    console.log(`结束:${message.subtype}`);
  }
}
```

三个部分:`query()` 是入口,返回一个异步迭代器;`prompt` 是任务;`options` 是配置。你没有写任何工具实现——**Claude 直接执行工具,而不是让你去实现它们**,这是 Agent SDK 和 Messages API 最大的不同。

---

## 四、循环里发生了什么

```
你的 prompt
   ↓
① 接收:system prompt + 工具定义 + 历史 + prompt       → SystemMessage(init)
② Claude 评估,输出文字和 / 或工具调用                 → AssistantMessage(每个内容块一条)
③ SDK 执行工具,结果送回 Claude                        → UserMessage(工具结果)
④ 重复 ②③,直到某次回应里没有工具调用
⑤ 返回最终结果                                       → AssistantMessage + ResultMessage
```

一个 **turn** 是一次来回:Claude 调用工具,SDK 执行,结果送回。这个过程不会把控制权交还给你的代码,直到 Claude 给出一个不带工具调用的回应。

以"修复 auth.ts 里失败的测试"为例:

1. Turn 1:`Bash` 跑 `npm test`,三个失败
2. Turn 2:`Read` 读 `auth.ts` 和 `auth.test.ts`
3. Turn 3:`Edit` 修 `auth.ts`,再 `Bash` 跑测试,全部通过
4. 最后:只有文字的回应"修好了,三个测试都通过"

一共四个 turn:三个带工具调用,一个纯文字。这就是 01 篇讲的 Claude Code 工作方式,只是现在你能在代码里看到每一步。

---

## 五、消息类型

| 类型 | 什么时候出现 | 内容 |
| --- | --- | --- |
| `SystemMessage` | 会话生命周期事件 | `subtype`:`init`(会话元数据)、`compact_boundary`(压缩之后)、`informational`(状态提示)等 |
| `AssistantMessage` | Claude 的每个内容块 | **每条只带一个内容块**(一段文字或一个工具调用),同一次回应的几条共享消息 ID |
| `UserMessage` | 每次工具执行后 | 工具结果;也包括你在循环中途发进去的输入 |
| `StreamEvent` | 开启部分消息时 | 原始的流式事件(文字增量、工具输入片段) |
| `ResultMessage` | 循环结束 | 最终文本、token 用量、成本、会话 ID |

- Python 用 `isinstance()` 判断类型;TypeScript 看 `message.type` 字符串
- TypeScript 里 `AssistantMessage` 和 `UserMessage` 把原始 API 消息包在 `.message` 字段里,内容块在 `message.message.content`
- `ResultMessage` 之后可能还有少量系统事件,**把流迭代完**再退出
- 要实时显示打字效果,开启 `include_partial_messages` / `includePartialMessages`

---

## 六、处理结果

`ResultMessage.subtype` 是判断结束状态的主要依据:

| subtype | 含义 | 有 `result` 吗 |
| --- | --- | :---: |
| `success` | 正常完成 | ✓ |
| `error_max_turns` | 达到 `max_turns` | ✗ |
| `error_max_budget_usd` | 达到 `max_budget_usd` | ✗ |
| `error_during_execution` | 执行中出错(比如请求被取消) | ✗ |
| `error_max_structured_output_retries` | 重试多次仍没有产出合法的结构化输出(34 篇) | ✗ |

```python
try:
    async for message in query(prompt=task, options=options):
        if isinstance(message, ResultMessage):
            if message.subtype == "success":
                print(message.result)
            else:
                print(f"未完成:{message.subtype}")
            session_id = message.session_id          # 出错了也能拿到,用来续接
except Exception as e:
    print(f"会话异常结束:{e}")
```

几个细节:

- **单次 `query()` 遇到错误结果时,会先产出结果消息,然后抛异常**(比如 `Reached maximum number of turns`)。这是故意的,需要继续执行就包一层 `try`
- 所有 subtype 都带 `total_cost_usd`、`usage`、`num_turns`、`session_id`。Python 里这几个是可选类型,读之前判空
- `usage` 只统计主循环;**包括子 agent 在内的全部用量看 `model_usage`**(TS 里是 `modelUsage`)
- `stop_reason` 是 `"refusal"` 时表示模型拒绝了请求

---

## 七、控制循环

所有选项都在 `ClaudeAgentOptions`(Python)/ `Options`(TypeScript)里。

### 7.1 次数和预算

| 选项 | 控制什么 | 默认 |
| --- | --- | --- |
| `max_turns` | 最多多少次工具来回 | 不限 |
| `max_budget_usd` | 估算花费到多少就停 | 不限 |

**生产环境的 agent 默认都应该设预算**。开放式的任务("优化一下这个代码库")不设上限可能跑很久。预算包括子 agent 的花费;每次模型响应回来后才比较,所以最后一次响应可能让总额略微超过上限。

### 7.2 Effort 和模型

`effort` 取 `low` / `medium` / `high` / `xhigh` / `max`(07、26 篇)。只读文件、列目录这种简单任务用 `low` 能明显省钱;不设时 Claude Code 按自己的规则决定。`model` 选模型。

### 7.3 权限

| 选项 | 作用 |
| --- | --- |
| `allowed_tools` | 这些工具**自动批准**。没列出的工具仍然可用,只是需要批准 |
| `disallowed_tools` | 这些工具**一律禁止**,优先级最高 |
| `permission_mode` | 整体的监督程度 |

| 模式 | 行为 | 适合 |
| --- | --- | --- |
| `default` | 需要批准的调用交给你的 `can_use_tool` 回调;**没有回调就拒绝** | 有自定义审批界面的交互式应用 |
| `acceptEdits` | 自动批准文件编辑和常见文件系统命令 | 开发机上、在隔离目录里快速迭代 |
| `plan` | 只探索和规划,不改源文件 | 先提方案,人审批后再执行 |
| `dontAsk` | 从不询问:规则预先批准的照常执行,其余需要询问的一律拒绝 | 无人值守、只允许白名单 |
| `auto` | 用分类器审查命令和网络请求(04 篇的 auto mode) | 自主运行但仍要安全护栏 |
| `bypassPermissions` | 除了显式的 `ask` 规则等少数情况,全部直接执行 | 只在完全隔离的沙箱里 |

规则语法和 Claude Code 相同,比如 `"Bash(npm *)"` 只允许 npm 命令(03 篇)。权限的完整判定顺序和 `can_use_tool` 回调在 34 篇讲。

### 7.4 并行执行

Claude 一次请求多个工具时:只读的工具(`Read`、`Glob`、`Grep`、标为只读的 MCP 工具)可以并发执行;会改状态的(`Edit`、`Write`、`Bash`)按顺序执行。自定义工具默认顺序执行,在注解里设 `readOnlyHint` 才会并发(33 篇)。

---

## 八、上下文与 Claude Code 的特性

### 8.1 默认会加载你的 Claude Code 配置

**不设 `setting_sources` 时,`query()` 读取的配置和 CLI 完全一样**:用户、项目、本地三级的 settings,CLAUDE.md,`.claude/` 下的 skills、agents、commands。

| 来源 | 加载什么 |
| --- | --- |
| `"user"` | `~/.claude/` 下的 settings、CLAUDE.md、rules、skills、commands、agents |
| `"project"` | `<cwd>/.claude/settings.json` 和 hooks;`<cwd>` 及上级目录的 CLAUDE.md 和 rules;skills、commands、agents |
| `"local"` | CLAUDE.local.md、`.claude/settings.local.json` |

**在 CI、部署的服务、多租户系统里,一定要设 `setting_sources=[]` 或只列需要的来源**,否则开发者本机或服务器上的个人配置会混进来。(Python SDK 0.1.59 及更早的版本把空列表当成"没设",要先升级。)

### 8.2 System prompt 的三个起点

| 起点 | 怎么设 | 得到什么 |
| --- | --- | --- |
| 最简默认 | 不设 `system_prompt` | 只有工具调用相关的最简提示,**没有 Claude Code 的安全指令** |
| `claude_code` 预设 | `system_prompt={"type": "preset", "preset": "claude_code"}` | 和 CLI 一样的完整提示词 |
| 自定义 | 一个字符串 | 只有你写的内容 |

怎么选:

- 做一个**人在旁边看着、随时干预的编码工具**(像 CLI 或 IDE 插件)→ `claude_code` 预设,需要加规则就用预设的 `append`,这是风险最低的定制
- **界面不同**(聊天界面、结构化输出消费方)、**身份不同**(客服、数据分析助手)、**权限模型不同**(无人值守)、**不是编码任务** → 自己写 system prompt,并且自己补上需要的工具指导和安全规则
- 只想要一个薄薄的工具调用循环,所有行为都写在用户 prompt 里 → 不设

注意 `claude -p` 用的是完整的 Claude Code 提示词,**SDK 的默认不是**。从旧版 Claude Code SDK 迁移过来时,这是最容易忽略的变化。

CLAUDE.md 走的是另一条路:它的内容作为项目上下文注入对话,不改 system prompt,所以和上面任何一种都能一起用。

### 8.3 自动压缩

上下文接近上限时,SDK 自动压缩:总结较早的历史,保留最近的交流和关键决定,并在流里发出一条 `compact_boundary` 系统消息。

- 压缩会丢掉早期的具体指令。**需要一直生效的规则放进 CLAUDE.md**,不要只写在第一个 prompt 里——CLAUDE.md 每次请求都会重新注入
- 在 CLAUDE.md 里写一段"总结时要保留什么",压缩器会照着做
- `PreCompact` hook 可以在压缩前做事,比如归档完整记录
- 把 `/compact` 作为 prompt 发进去可以手动触发

05 篇讲的 Claude Code 上下文管理,这里全部适用。

---

## 九、会话:继续、恢复、分叉

| 场景 | 用什么 |
| --- | --- |
| 一次性任务 | 一次 `query()`,什么都不用加 |
| 同一个进程里多轮对话 | Python 用 `ClaudeSDKClient`;TS 用 `continue: true` |
| 进程重启后接着上次的 | `continue_conversation=True` / `continue: true`:恢复当前目录最近的会话 |
| 恢复某个指定的会话 | 存下 `session_id`,传给 `resume` |
| 试另一种方案,不破坏原来的 | `resume` + `fork_session=True` |
| 不想写任何东西到磁盘 | TS 设 `persistSession: false` |

```python
from claude_agent_sdk import ClaudeSDKClient

async with ClaudeSDKClient(options=ClaudeAgentOptions(allowed_tools=["Read", "Glob", "Grep"])) as client:
    await client.query("分析一下 auth 模块")
    async for m in client.receive_response():
        ...
    await client.query("现在把它改成用 JWT")       # 自动接着上一轮,有完整上下文
    async for m in client.receive_response():
        ...
```

`ClaudeSDKClient` 还支持 `interrupt()`(中断当前任务)、`set_permission_mode()`、`set_model()`,适合聊天界面这类"下一步取决于 Claude 回答"的应用。单次的 `query()` 不支持中断。

要知道的几件事:

- 会话存在 `~/.claude/projects/<编码后的 cwd>/*.jsonl`,和 CLI 的会话是同一套
- **会话保存的是对话,不是文件系统**。分叉出去的会话改了文件,改动是真实的,同一目录下的其他会话都能看到。要快照和回滚文件,用 file checkpointing(34 篇)
- 跨机器、无状态容器、serverless 里恢复会话,要用 `SessionStore` 适配器把记录同步到你自己的存储(34 篇)

---

## 十、两种输入模式

| 模式 | 怎么用 | 适合 |
| --- | --- | --- |
| **流式输入**(推荐) | `prompt` 传一个异步迭代器,持续产出用户消息 | 长期运行的交互式会话:可以发图片、排队多条消息、中途打断、处理权限请求 |
| 单条消息 | `prompt` 传一个字符串 | 一次性任务、CI、后台作业 |

```python
async def messages():
    yield {"type": "user", "message": {"role": "user", "content": "分析这个代码库的安全问题"}}
    await asyncio.sleep(5)
    yield {"type": "user", "message": {"role": "user", "content": "重点看认证部分"}}

async for m in query(prompt=messages(), options=options):
    ...
```

流式输入模式下,循环结束(比如达到 `max_turns`)时会话仍然存活,可以继续发消息;单次 `query()` 则会抛异常结束。

---

## 十一、从 Claude Code SDK 迁移

| 旧 | 新 |
| --- | --- |
| `@anthropic-ai/claude-code`(作为库使用时) | `@anthropic-ai/claude-agent-sdk` |
| `claude-code-sdk` / `from claude_code_sdk import ...` | `claude-agent-sdk` / `from claude_agent_sdk import ...` |
| `ClaudeCodeOptions` | `ClaudeAgentOptions` |
| 默认使用 Claude Code 的 system prompt | **默认是最简提示**,要旧行为就显式指定 `claude_code` 预设 |

`setting_sources` 的默认值在 0.1.0 短暂改成过"什么都不加载",后来又改回来了,现在不设就是全部加载。TypeScript SDK 曾经有一个实验性的 V2 会话 API(`unstable_v2_createSession` 等),在 0.3.142 版本已经移除,改用 `query()` 加会话选项。

---

## 十二、踩坑

1. **以为 SDK 默认用的是 Claude Code 的 system prompt**——默认是最简提示,没有安全指令。需要就显式指定 `claude_code` 预设
2. **在 CI 或服务端不设 `setting_sources`**——开发者本机或服务器上的个人配置、hooks 会混进来
3. **把 API key 写在 `.env` 里等 SDK 自动读**——它不会读,自己加载
4. **TypeScript 里读 `message.content`**——内容块在 `message.message.content`
5. **生产 agent 不设 `max_budget_usd`**——开放式任务可能一直跑下去
6. **`default` 模式下没有提供 `can_use_tool` 回调**——所有需要批准的调用都被拒绝,agent 看起来"什么都做不了"
7. **只看 `usage` 统计成本**——它不含子 agent,看 `model_usage`
8. **以为分叉会话也分叉了文件**——只分叉对话,文件改动是共享的
9. **单次 `query()` 出错就整个程序崩溃**——它在产出错误结果后会抛异常,包 `try` 并保存 `session_id` 以便续接
10. **在产品里让用户用 claude.ai 账号登录**——未经批准不允许,用 API key

---

下一篇:`33-Agent-SDK扩展-工具-MCP与子代理.md`,讲怎么给 SDK agent 加能力:用 `@tool` 定义进程内的自定义工具、连接外部 MCP server、工具搜索、用代码定义子 agent,以及加载 skills 和 plugins。
