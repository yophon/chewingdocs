# Hooks 钩子系统

Skill 是"你或 Claude 决定要用的",hook 是"**事件发生就一定执行的**"。Claude Code 在生命周期的几十个节点上触发事件:会话开始、你提交消息、工具即将调用、工具调用完成、Claude 停止回复、上下文压缩……每个事件上都可以挂 hook,运行一段脚本、调一个 HTTP 接口、调一个 MCP 工具,甚至让一个模型或子代理来做判断。

> 一句话先记住:**hook 是 harness 直接执行的,不经过模型的决定**。模型永远只能"决定要不要调用某个工具",它没法保证某件事每次都发生。写在 CLAUDE.md 里的"每次改完都跑格式化"是请求;写成 `PostToolUse` hook 才是保证。

---

## 一、为什么需要 hook

| 想要的事 | 写进 CLAUDE.md / skill | 写成 hook |
| --- | --- | --- |
| 每次改完文件都格式化 | 大概率会做,有时忘 | 每次都执行 |
| 禁止改 `.env` | 请求,可能被绕过 | `PreToolUse` 直接拦下 |
| Claude 等你输入时弹通知 | 做不到 | `Notification` 事件 |
| 压缩后重新提醒关键约定 | 不可控 | `SessionStart` + `compact` 匹配 |
| 每次会话结束归档记录 | 做不到 | `SessionEnd` 事件 |

> 任何带"**每次 X 一定要 Y**"、"**禁止**"、"**必须**"字眼的需求,都该考虑 hook,而不是写进 prompt。

hook 的上下文成本是**零**:它在对话之外运行,除非它主动返回内容给 Claude。

---

## 二、第一个 hook:Claude 等你时弹通知

`~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code needs your attention\" with title \"Claude Code\"'"
          }
        ]
      }
    ]
  }
}
```

结构是三层:**事件名 → 匹配组(`matcher`)→ hook 列表**。Linux 上把命令换成 `notify-send`,Windows 上换成 PowerShell 的通知命令即可。配好后用 `/hooks` 查看所有已配置的 hook。

---

## 三、事件清单

现在的事件远不止早期的八种。按用途分组:

| 分组 | 事件 | 什么时候触发 |
| --- | --- | --- |
| **会话** | `SessionStart` / `SessionEnd` | 会话开始(含恢复、清空、压缩后、分叉)/ 结束 |
| | `Setup` | 用 `--init-only` 等参数做一次性准备时 |
| **输入** | `UserPromptSubmit` | 你提交消息,Claude 处理之前 |
| | `UserPromptExpansion` | 你输入的命令展开成 prompt 之前,可拦截 |
| **工具** | `PreToolUse` | 工具调用执行前,**可拦截** |
| | `PermissionRequest` | 需要权限决定时 |
| | `PermissionDenied` | auto mode 拒绝了一个调用时 |
| | `PostToolUse` / `PostToolUseFailure` | 工具调用成功 / 失败后 |
| | `PostToolBatch` | 一批并行工具调用全部结束后 |
| **回复** | `Stop` | Claude 完成一次回复 |
| | `StopFailure` | 因 API 错误结束这一轮 |
| | `Notification` | 发出通知(等待输入、等待授权等) |
| | `MessageDisplay` | 显示回复文字时 |
| **子代理与任务** | `SubagentStart` / `SubagentStop` | 子代理启动 / 结束 |
| | `TaskCreated` / `TaskCompleted` | 任务清单里新建 / 完成任务 |
| | `TeammateIdle` | agent team 的队友即将空闲 |
| **上下文** | `PreCompact` / `PostCompact` | 上下文压缩前 / 后 |
| | `InstructionsLoaded` | CLAUDE.md 或 rules 文件被加载进上下文 |
| **环境** | `ConfigChange` | 会话中配置文件变化 |
| | `CwdChanged` / `DirectoryAdded` | 工作目录变化 / 新增目录 |
| | `FileChanged` | 被监视的文件在磁盘上变化 |
| | `WorktreeCreate` / `WorktreeRemove` | 创建 / 移除 worktree(可替换默认的 git 行为) |
| **模型** | `PreModelSwitch` / `PostModelSwitch` | 模型切换前(可拦截)/ 后 |
| **MCP** | `Elicitation` / `ElicitationResult` | MCP server 请求用户输入 / 用户回应后 |

日常最常用的是 `PreToolUse`、`PostToolUse`、`Stop`、`SessionStart`、`Notification`。

---

## 四、五种 hook 类型

| `type` | 做什么 | 适合 |
| --- | --- | --- |
| `command` | 跑一个 shell 命令 | 绝大多数场景 |
| `http` | 把事件数据 POST 到一个 URL | 团队共享的审计服务、云函数 |
| `mcp_tool` | 调用已配置的 MCP server 上的一个工具 | 复用已有的 MCP 能力 |
| `prompt` | 让模型做一次判断 | 需要判断力而不是固定规则的决定 |
| `agent` | 派一个能用工具的子代理去核实(实验性) | 要真正检查代码库状态才能判断的情况 |

### 4.1 prompt 型:让模型判断

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "检查用户要求的所有任务是否都已完成。没完成就返回 {\"ok\": false, \"reason\": \"还剩什么没做\"}。"
          }
        ]
      }
    ]
  }
}
```

模型只需返回 `{"ok": true}` 或 `{"ok": false, "reason": "..."}`。在 `Stop` 上返回 `false`,Claude 会把 `reason` 当成下一步指令继续干——08 篇的 `/goal` 就是基于这个机制。

### 4.2 agent 型:让子代理核实

```json
{
  "type": "agent",
  "prompt": "确认所有单元测试都通过:运行测试套件并检查结果。",
  "timeout": 120
}
```

和 prompt 型的区别:**prompt 型只看事件数据,agent 型能读文件、跑命令**。只靠输入数据就能判断的用 prompt 型,需要核对代码库真实状态的用 agent 型。agent 型还是实验性功能,生产环境优先用 command 型。

### 4.3 http 型

```json
{
  "type": "http",
  "url": "https://audit.internal.example.com/hooks/tool-use",
  "headers": { "Authorization": "Bearer $AUDIT_TOKEN" },
  "allowedEnvVars": ["AUDIT_TOKEN"]
}
```

端点收到的 JSON 和 command 型的 stdin 一样,用同样的 JSON 格式回复。请求头里的环境变量**只有列在 `allowedEnvVars` 里的才会被替换**。

---

## 五、匹配:matcher 与 if

### 5.1 matcher

不同事件的 matcher 匹配不同的字段:

| 事件 | matcher 匹配什么 | 例子 |
| --- | --- | --- |
| 工具类事件 | 工具名 | `Bash`、`Edit\|Write`、`mcp__github__.*` |
| `SessionStart` | 会话怎么开始的 | `startup`、`resume`、`clear`、`compact`、`fork` |
| `SessionEnd` | 为什么结束 | `clear`、`logout`、`prompt_input_exit` |
| `Notification` | 通知类型 | `permission_prompt`、`idle_prompt` |
| `SubagentStart` / `Stop` | 子代理类型 | `Explore`、自定义名字 |
| `PreCompact` / `PostCompact` | 触发方式 | `manual`、`auto` |
| `FileChanged` | 要监视的文件名 | `.envrc\|.env` |
| `UserPromptSubmit`、`Stop` 等 | 不支持 matcher,每次都触发 | — |

matcher **区分大小写**,用 `|` 或逗号分隔多个值,空字符串匹配所有。

### 5.2 `if`:按工具和参数一起过滤

matcher 只能按工具名过滤。要按参数过滤,用 `if`,它使用和权限规则一样的语法:

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "if": "Bash(git *)",
      "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check-git-policy.sh"
    }
  ]
}
```

这个 hook 只在 Claude 跑 git 命令时才启动进程,包括 `npm test && git push` 这种复合命令里的 git 部分。`if` 只对工具类事件有效。

> **只靠 `Edit|Write` 是看不到所有文件改动的**:Claude 也能用 shell 命令改文件。合规扫描、审计日志这类必须覆盖所有改动的需求,再加一个 `Stop` hook 每轮扫一次工作区。

---

## 六、输入输出协议

### 6.1 输入:stdin 上的 JSON

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/you/.claude/projects/.../abc123.jsonl",
  "cwd": "/Users/you/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" }
}
```

不同事件附加不同字段:`PostToolUse` 有工具返回结果,`UserPromptSubmit` 有 `prompt`,`SessionStart` 有 `source`,`Stop` 有 `stop_hook_active`。脚本里用 `$CLAUDE_PROJECT_DIR` 引用项目路径。

### 6.2 输出方式一:退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 没有意见,按正常流程走。注意:`PreToolUse` 退出 0 **不等于批准**,仍要走权限流程 |
| `2` | 阻断。stderr 的内容作为原因反馈给 Claude(或显示给你,取决于事件) |
| 其他 | 非阻断错误,动作继续执行,对话里显示一条 hook error |

想让 hook 自身出错时也阻断动作,设 `"onFailure": "block"`。

### 6.3 输出方式二:JSON

退出 0 并在 stdout 打印 JSON,可以做更精细的控制。`PreToolUse` 的例子:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "请用 rg 代替 grep"
  }
}
```

`permissionDecision` 可以是 `deny`(拒绝并告诉 Claude 原因)、`ask`(弹出正常的授权窗口)、`allow`(跳过授权弹窗)、`defer`(仅非交互模式,保留调用、结束本轮,方便外层程序收集输入后恢复)。

给 Claude 补充上下文用 `additionalContext`,**必须放在 `hookSpecificOutput` 里**,放在顶层会被静默忽略:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "当前分支:release-42。周五前封版,禁止部署。"
  }
}
```

不同事件的决策字段不同:`PostToolUse` 和 `Stop` 用顶层的 `decision: "block"`,`PermissionRequest` 用 `hookSpecificOutput.decision.behavior`。**退出码和 JSON 每个 hook 只选一种**,混用的行为不直观。

### 6.4 多个 hook 匹配同一事件

它们**并行运行,全部跑完后再合并结果**。权限决定取最严格的:`deny` > `defer` > `ask` > `allow`;所有 `additionalContext` 都会保留。一个 hook 返回 deny 不会阻止其他 hook 执行,所以别指望靠一个 hook 的 deny 来避免另一个 hook 的副作用。

---

## 七、hook 和权限的关系

- **hook 的 `allow` 放不过规则的 `deny`**:deny 规则照样拦,ask 规则照样问
- **hook 的 `deny` 在任何模式下都有效**,包括 `bypassPermissions`——`PreToolUse` 在权限模式检查之前触发
- **退出码 2 的阻断先于 allow 规则**:hook 拦下的调用,allow 规则救不回来
- plan mode 下 hook 对文件编辑返回 `allow`,不会绕过 plan mode 的限制

所以 hook 是**收紧**权限的好工具,不是放宽权限的后门。

---

## 八、常用配方

### 8.1 改完自动格式化

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/format.sh" }
        ]
      }
    ]
  }
}
```

```bash
#!/usr/bin/env bash
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  *.ts|*.tsx|*.js|*.jsx) npx prettier --write "$file" ;;
  *.py)                  ruff format "$file" ;;
  *.go)                  gofmt -w "$file" ;;
esac
```

### 8.2 保护敏感文件

```bash
#!/bin/bash
# .claude/hooks/protect-files.sh
FILE_PATH=$(jq -r '.tool_input.file_path // empty')
FILE_PATH="${FILE_PATH//\\//}"   # 兼容 Windows 路径分隔符
for pattern in ".env" "package-lock.json" ".git/"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "已阻止:$FILE_PATH 匹配受保护模式 '$pattern'" >&2
    exit 2
  fi
done
exit 0
```

挂在 `PreToolUse`、matcher 为 `Edit|Write`。macOS / Linux 上记得 `chmod +x`。

### 8.3 压缩后重新注入关键约定

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          { "type": "command", "command": "echo '提醒:用 bun 不用 npm;提交前跑 bun test;当前迭代:auth 重构'; git log --oneline -5" }
        ]
      }
    ]
  }
}
```

`SessionStart` 的 stdout 会直接加进 Claude 的上下文。

### 8.4 自动批准某类弹窗

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"hookSpecificOutput\": {\"hookEventName\": \"PermissionRequest\", \"decision\": {\"behavior\": \"allow\"}}}'"
          }
        ]
      }
    ]
  }
}
```

### 8.5 其他常见用途

- `FileChanged` 监视 `.envrc`,配合 direnv 自动重载环境;`CwdChanged` 在切目录时同样处理
- `ConfigChange` 记录配置变更做审计
- `SessionEnd` 把会话记录(`transcript_path`)归档到别处
- `InstructionsLoaded` 记录每个指令文件何时、为何被加载,排查 rules 不生效
- `PreModelSwitch` 在缓存还热时要求你确认切换模型

---

## 九、hook 写在哪

| 位置 | 范围 |
| --- | --- |
| `~/.claude/settings.json` | 你的所有项目 |
| `.claude/settings.json` | 这个项目,可提交共享 |
| `.claude/settings.local.json` | 这个项目,只有你 |
| managed settings | 整个组织 |
| 插件的 `hooks/hooks.json` | 启用插件时 |
| skill 的 frontmatter | skill 被调用后到会话结束 |
| 子代理的 frontmatter | 那个子代理运行期间 |

**所有来源的 hook 都会合并**,不会互相覆盖。`"disableAllHooks": true` 可以关掉(managed 的 hook 除外)。直接编辑 settings 文件时,文件监视器通常会自动加载新的 hook。

---

## 十、限制与排查

### 限制

- **超时**:command / http / mcp_tool 默认 10 分钟(`UserPromptSubmit` 和模型切换类降到 30 秒);prompt 型 30 秒;agent 型 60 秒;所有 `SessionEnd` hook 共享 1.5 秒预算。用 `timeout` 字段单独设置
- **`PostToolUse` 撤不回动作**,工具已经执行完了
- **`Stop` 每次回复结束都触发**,不只是任务完成时;你打断时不触发;API 错误触发的是 `StopFailure`
- **`Stop` hook 连续阻断 8 次**(中间没有任何工具调用)会被强制放行。脚本里要检查 `stop_hook_active`,避免无限循环
- command 型 hook 不能触发 `/` 命令或工具调用,只能通过输出影响 Claude
- 多个 hook 都用 `updatedInput` 改写工具参数时,最后完成的那个生效,顺序不确定

### 排查

1. `/hooks` 确认 hook 出现在正确的事件下(skill 里的 hook 要等 skill 被调用后才会列出)
2. matcher 大小写是否完全一致
3. 脚本有没有执行权限,路径是否用了 `$CLAUDE_PROJECT_DIR`
4. JSON 输出不生效:检查是否放对了层级(`additionalContext` 要在 `hookSpecificOutput` 里)、是否同时用了退出码
5. 也可以直接让 Claude 帮你配:`/update-config` 用自然语言描述要什么 hook

---

## 十一、踩坑

1. **把"必须"写进 CLAUDE.md 而不是 hook**——模型会忘,hook 不会
2. **`PreToolUse` 退出 0 以为是批准**——0 只是"没意见",照样走权限流程
3. **`additionalContext` 放在 JSON 顶层**——被静默忽略
4. **只用 `Edit|Write` 做审计**——shell 命令改的文件看不到,补一个 `Stop` hook
5. **`Stop` hook 不检查 `stop_hook_active`**——连续阻断 8 次后被强制放行,白忙一场
6. **hook 脚本很慢**——每次事件都要等它。耗时操作考虑 `async` 后台运行
7. **用 hook 的 `allow` 绕过 deny 规则**——做不到,hook 只能收紧
8. **在 hook 里依赖当前目录**——用 `$CLAUDE_PROJECT_DIR` 写绝对路径
9. **matcher 写成小写 `bash`**——区分大小写,匹配不上
10. **HTTP hook 的 header 引用了没在 `allowedEnvVars` 里列出的变量**——会被替换成空值

---

下一篇:`12-MCP在Claude-Code里的用法.md`,讲怎么添加和管理 MCP server、三种作用域、OAuth 认证、工具搜索如何控制上下文开销,以及组织怎么管控可用的 server。
