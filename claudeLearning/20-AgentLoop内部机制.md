# Agent Loop 内部机制

19 篇说"Agent SDK 是 Claude Code 的内核"。这一篇剖开内核——**主循环到底跑了什么、prompt 怎么组装、permission 怎么挂上去、long session 时 context 怎么不爆**。这一篇看完你应该有信心:遇到 Agent 行为不符合预期时,**能定位到具体哪一层在做什么**。

> 一句话先记住:**Agent Loop = "组 prompt → 调 Anthropic API → 处理工具 → 回灌结果 → 检查终止 → 必要时 compact"** 一直转。每一步都有 hook 点你可以介入。

---

## 一、主循环伪代码

```python
def agent_loop(initial_prompt, options):
    messages = []
    if initial_prompt:
        messages.append({"role": "user", "content": initial_prompt})

    system = build_system_prompt(options)        # 1. 组 system
    tools = collect_tools(options)               # 2. 收集所有 tool

    while True:
        # 3. 长 context 时 compact
        if needs_compaction(messages):
            messages = compact_messages(messages)

        # 4. 调 Anthropic API
        resp = anthropic.messages.create(
            model=options.model,
            system=system,
            tools=tools,
            messages=messages,
            stream=True,
            cache_control=...,
        )

        # 5. 累积 assistant 回复
        messages.append({"role": "assistant", "content": resp.content})

        # 6. 触发 hook PostMessage
        run_hooks("PostMessage", resp)

        # 7. 看 stop reason
        if resp.stop_reason == "end_turn":
            yield resp                # 流出最终消息
            break

        if resp.stop_reason == "tool_use":
            tool_results = []
            for block in resp.content:
                if block.type == "tool_use":
                    # 8. 触发 PreToolUse hook
                    decision = run_hooks("PreToolUse", block)
                    if decision == "block":
                        tool_results.append({"type": "tool_result", "tool_use_id": block.id,
                                             "content": "blocked", "is_error": True})
                        continue

                    # 9. permission callback
                    if not user_approves(block):
                        tool_results.append(...denied...)
                        continue

                    # 10. 执行工具
                    result = dispatch_tool(block.name, block.input)

                    # 11. PostToolUse hook
                    run_hooks("PostToolUse", block, result)

                    tool_results.append({"type": "tool_result",
                                         "tool_use_id": block.id,
                                         "content": result})

            # 12. 把所有工具结果塞回 messages
            messages.append({"role": "user", "content": tool_results})

            # 13. 检查 max_turns
            if turn_count >= options.max_turns:
                break

        if resp.stop_reason == "max_tokens":
            # 14. LLM 写到 max_tokens 截断,通常 prompt 让它继续
            messages.append({"role": "user", "content": "请继续"})
```

**这就是 Agent Loop 的全貌**。每一步都是确定的;LLM 的"智能"只在第 4 步发生(模型决定调谁、说什么)。

---

## 二、System Prompt 怎么组装

`build_system_prompt(options)` 大致这样工作:

```
1. 内置基础 system prompt(描述工具、行为约束)
2. + setting_sources 里的 CLAUDE.md / .claude/CLAUDE.md
3. + 用户传的 system_prompt 参数
4. + 启用的 skills 描述(progressive disclosure 用)
```

最终一个 list:

```python
system = [
    {"type": "text", "text": INTERNAL_BASE_PROMPT},
    {"type": "text", "text": USER_CLAUDE_MD,    "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": PROJECT_CLAUDE_MD, "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": SKILLS_DIRECTORY,  "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": options.system_prompt or ""},
]
```

> 大段 cache_control 在这里——SDK 自动给 long stable 部分缓存,**应用代码什么都不用管**。

---

## 三、Tools 怎么收集

```
1. 内置工具(Read / Edit / Write / Bash / Glob / Grep / Task / TodoWrite / SlashCommand / WebFetch / WebSearch)
2. + 通过 MCP servers 暴露的所有 tool(以 mcp__<server>__<tool> 命名)
3. + custom_tools 参数注册的 Python/TS 函数
4. + setting_sources 里的 .claude/agents/*.md 转换出的 subagent 工具
```

最终给 Anthropic API 的 tools 数组里,所有这些工具拍平在一起。

**LLM 看到的工具列表**,LLM 按 description 选谁。

---

## 四、Permission Callback 时序

每次 LLM 想调一个工具,SDK 会:

```
1. 检查 allowed_tools / disallowed_tools(白/黑名单)
2. 检查 permissions matcher(allow/deny/ask)
3. 如果是 ask 或没匹配 → 调 permission_prompt_callback
4. callback 返回 "allow" / "deny" / "ask_user"
5. ask_user → 真的弹给最终用户(CLI 是问你,API 服务可能是 webhook)
6. allow 则执行;deny 则把 "denied" 作为 tool_result 返回 LLM
```

写一个 callback:

```python
async def my_permission(tool_name, tool_input, context):
    if tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if "rm -rf" in cmd or "DROP TABLE" in cmd:
            return {"behavior": "deny", "message": "命中危险命令规则"}
        if cmd.startswith("git push"):
            # 业务逻辑:某些 user 不能 push
            if not context.user.can_push:
                return {"behavior": "deny", "message": "权限不足"}
    return {"behavior": "allow"}

async for msg in query(prompt="...",
                       options=ClaudeAgentOptions(permission_prompt_callback=my_permission)):
    ...
```

> 写 Agent SaaS 时,permission callback 是**业务安全的最后防线**——比 settings 里的静态 matcher 灵活,可以查数据库 / RBAC / 风控。

---

## 五、Context Compaction 触发条件

Compaction 是 SDK 自动做的"长 context 减肥"。

### 5.1 触发条件

- messages 总 token 超过模型 context 窗的 ~85%
- 或者 SDK 检测到"早期消息已经不再相关"
- 或者用户 / Agent 主动触发(`/compact` slash 等)

### 5.2 怎么 compact

不是简单"丢前 N 条",而是 **summary**:

```
1. 把早期 messages(典型 50% 以上)抽出来
2. 单独发给一个 Claude 让它写 summary
3. 用 summary 替换原始 messages,history 变成:
     {role: user, content: "[历史摘要] " + summary}
     {最近的 N 条 messages 保留}
4. cache breakpoint 重新设置(从 summary 之后开始 cache)
```

效果:context 从 150K 压到 30K,LLM **保留主线但放弃细节**。

> 这是为什么 Claude Code 长 session 跑了 8 小时仍然有用——它在你不注意时反复 compact。

### 5.3 副作用

Compaction 会丢失早期对话的细节。**如果你在长 session 中改了一个文件后忘了文件路径,LLM compact 后可能记不住路径**——所以重要事实要在最近的对话里复述,或写到 CLAUDE.md。

---

## 六、Stream 处理与 Final Message

SDK 使用 streaming 模式,每个 message 是一系列 events:

```python
async for event in stream:
    if event.type == "content_block_start":
        ...    # 工具开始 / 文本开始 / thinking 开始
    elif event.type == "content_block_delta":
        ...    # 增量(text_delta / input_json_delta / thinking_delta)
    elif event.type == "content_block_stop":
        ...    # 块结束
    elif event.type == "message_delta":
        ...    # 最终 message 的元数据(usage / stop_reason)
    elif event.type == "message_stop":
        ...    # 整条 message 结束

final = stream.get_final_message()  # 拼好的完整 message
```

**应用层通常不直接消费这些 event**——SDK 提供更高层的"message stream":

```python
async for msg in query(prompt="...", options=options):
    if msg.type == "user":          # SDK 内部发的(tool result)
        continue
    if msg.type == "assistant":     # LLM 回复
        for block in msg.content:
            if block.type == "text":
                print(block.text, end="")
            elif block.type == "tool_use":
                print(f"\n[调用工具] {block.name}")
    if msg.type == "result":        # 任务完成
        print(f"\n[完成] cost ${msg.total_cost_usd}")
```

---

## 七、stop_reason 的几种情况

| stop_reason | 含义 | SDK 行为 |
| --- | --- | --- |
| `end_turn` | LLM 主动结束 | 退出循环,任务完成 |
| `tool_use` | LLM 想调工具 | 执行 tool,继续循环 |
| `max_tokens` | 输出达到 max_tokens 截断 | SDK 一般会自动让它"继续" |
| `stop_sequence` | 命中 stop_sequences | 退出循环 |
| `pause_turn` | extended thinking 暂停 | 继续循环 |

**新写 Agent 框架的人最容易忽视**:`max_tokens` 不是错误,是模型说"我话还没说完但配额用了"。**该自动续而不是抛错**。

---

## 八、Hook 的执行顺序

Agent SDK 的 hook 比 Claude Code 多一些点位,但概念一致:

```
SessionStart
   ↓
[loop]
   UserPromptSubmit
   ↓ (调 LLM)
   LLM 流式输出
   ↓ (有 tool_use)
   PreToolUse
   ↓ (执行)
   PostToolUse
   ↓ (回到 loop)
   ...
   ↓ (LLM end_turn)
   Stop
   PreCompact (如果触发)
   ↓
SessionEnd
```

每个点都可以挂 callback / 子进程。**Hook 在 Agent SDK 里用 Python/TS 函数注册更顺手**,比 CLI 那边写 shell 脚本灵活。

---

## 九、Sub-agent 的内部实现

主 Agent 调 `Task` 工具时,SDK:

```
1. 创建一个新的 Agent Loop 实例
2. 复制当前 options(model、tools、permissions 等)
3. 给 subagent 一个独立的 messages history
4. 把 subagent.prompt 作为初始 user message
5. 跑 subagent loop 到结束
6. 把 subagent 最终 text 作为 tool_result 返回主 Agent
```

**关键**:subagent 是**真正的 fork**——独立 context、独立 token 计费、可独立配置(用 Haiku 让 subagent 干小活,主 Agent 用 Sonnet 决策)。

---

## 十、调试 Agent SDK

SDK 暴露 verbose / debug 选项:

```python
options = ClaudeAgentOptions(
    debug=True,             # 打印每步 LLM 输入输出
    verbose=True,
    transcript_path="...",  # 保留完整 transcript 文件
)
```

**调试黄金法则**:

1. 行为不符预期 → **看 transcript**(每步 LLM 看到了什么、说了什么)
2. 工具不被调 → **看 description**(LLM 不知道你的 tool 干啥)
3. 权限报错 → **看 callback 返回**(deny 时是不是没附 message)
4. 长 session 慢 → **看 compaction**(是不是该 compact 了)
5. 账单异常 → **看 usage**(每条 messages 的 cache_read 比例)

---

## 十一、踩坑

1. **不知道 SDK 内部用 cache 把 system / tools 缓存了**——以为自己要管,反而搞乱
2. **手写 tool loop 重新发明轮子**——SDK 早就处理了 stream / parallel / max_tokens 续传
3. **不实现 permission callback**——生产 Agent 必须有业务级权限拦截
4. **subagent 不区分 model**——主 Agent 用 Opus,subagent 也跟着 Opus,贵又慢;**给 subagent 单独 model**
5. **assume compaction 不丢信息**——它会丢早期细节;重要事实要进 system / 最近 messages
6. **stream 处理写得复杂**——直接用 high-level message stream;低层 events 99% 用不到
7. **max_turns 设太小**——20 步对大改造太少,Agent 半路被砍
8. **debug=True 一直开**——transcript 几个 G,占空间又难翻
9. **assume tool result 必须是 string**——可以是 list,可以含 image;**复杂返回值大胆用 list**
10. **以为 Agent SDK 内置 prompt 是黑盒**——它有 setting_sources 等开放参数,**你能控制 system prompt 的几乎每一段**

---

下一篇:`21-自定义Tool与Subagent.md`,讲在 Agent SDK 里怎么注册 Python/TS 函数当 tool、怎么配 subagent、怎么把 MCP server 嵌入。
