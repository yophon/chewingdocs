# Hooks 钩子系统

Slash 是"你触发的",Hook 是"事件触发的"——这是它们最大的差别。Claude Code 在内部有几个生命周期事件:用户提交 prompt、工具即将被调用、工具调用完成、Claude 停止响应……**每个事件你都能挂一段 shell 脚本**。挂得好,Claude 就像有个不知疲倦的小弟在替你跑各种检查、自动化、补丁脚本。

> 一句话先记住:**Hook 是 Claude Code 的"操作系统中断"**。LLM 自己永远不会"承诺保证某事一定发生"——它只能"决定调用某个工具"。让一件事**真正每次都跑**,你必须用 hook;memory / 偏好 / 提醒,都做不到。

---

## 一、为什么需要 hook

LLM 是概率系统,你写"每次提交前都跑测试",它**大概率**会跑,但有时会忘、有时会跳、有时根本没意识到。这种"自动化诉求"放到 prompt / memory 里都不可靠。

而 hook 不一样——**hook 是 harness(壳)直接执行的,不经过 LLM**。它是确定性的:配置写了,事件发生,它一定跑。

| 想要的事 | 放进 prompt / memory? | 写成 hook? |
| --- | --- | --- |
| "如果改 schema 文件,提醒我看 migration" | LLM 偶尔会忘 | hook 100% 触发 |
| "提交前一律跑 lint" | 经常被跳过 | 一定跑 |
| "我说 'ship' 时把改动 push 上去" | 不可控 | 不可绕过 |
| "禁止读 .env" | 容易被 LLM 用别的方式绕过 | hook 直接拦 |

> 任何带 "**每次 X 一定要 Y**" / "**之后必须 Z**" / "**禁止 / 强制 ...**" 字眼的需求,**都该用 hook,不该写进 prompt**。这是 hook 存在的根本理由。

---

## 二、八种 hook 事件

```
事件                      触发时机                        典型用途
─────────────────────────────────────────────────────────────────────
UserPromptSubmit         用户按下回车,prompt 即将发送      预处理 prompt、注入上下文
PreToolUse               LLM 决定调一个工具,执行前         审计、阻断危险操作
PostToolUse              工具调用完成                      格式化、加日志、跑 lint
Notification             Claude 等待用户输入 / 提示通知     桌面通知、声音提醒
Stop                     Claude 完成响应,即将把控制权交回   summary、自动 commit
SubagentStop             一个 subagent 结束               汇总 subagent 结果
PreCompact               即将做 context compaction         备份 transcript
SessionStart             session 开始(包括 resume)        欢迎信息、加载 context
SessionEnd               session 结束                     收尾、统计、清理
```

> 真正每天都用的是 `PreToolUse` / `PostToolUse` / `Stop` 这三个;其他按需上车。

---

## 三、最简 hook:跟工具调用挂钩

`.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/format.sh"
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/format.sh`:

```bash
#!/usr/bin/env bash
# 读 stdin 拿到事件 JSON
input=$(cat)

# parse 出被改的文件路径
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# 按扩展名跑对应的格式化器
case "$file" in
  *.ts|*.tsx|*.js|*.jsx) bunx prettier --write "$file" ;;
  *.py)                  ruff format "$file" ;;
  *.go)                  gofmt -w "$file" ;;
  *.rs)                  rustfmt "$file" ;;
esac
```

**结构**:`matcher`(哪些工具触发)+ `hooks`(数组,每条是一个命令)。

`matcher` 的写法和 permissions 一致:`Edit` / `Edit|Write` / `Bash` / `Bash(git push:*)` / `mcp__github__.*` 都行,正则风格。

---

## 四、JSON 输入 / 输出协议

Hook 不是"裸跑脚本",是和 Claude Code 之间的**结构化通信**。

### 4.1 stdin 拿事件 JSON

每个 hook 都会从 stdin 读到一个 JSON,字段大致是:

```json
{
  "session_id": "abc-123",
  "transcript_path": "/Users/.../session.jsonl",
  "cwd": "/Users/qjx/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf node_modules" }
}
```

`PostToolUse` 多了 `tool_response`(工具的返回);`UserPromptSubmit` 多了 `prompt`(用户输入);`Stop` 多了 `stop_hook_active`,等等。

### 4.2 stdout / exit code 控制 Claude

Hook 用 **退出码 + stdout** 跟 Claude 通信:

| 退出码 | 含义 |
| --- | --- |
| `0` | 通过,stdout 显示给用户(transcript mode 才看见) |
| `2` | **阻断**——把 stderr 内容回灌给 LLM 做反馈 |
| 其他非零 | 错误,stderr 显示给用户但不阻断 |

### 4.3 高级:JSON 输出控制流

Hook 也可以输出一段 JSON,做更细的控制:

```json
{
  "decision": "block",
  "reason": "本仓库禁止改 schema.sql,改库走 migration",
  "continue": false,
  "stopReason": "命中 schema 保护规则",
  "suppressOutput": false
}
```

`decision: "block"` + `reason` 是最常见的——拦下来并告诉 LLM 为什么(LLM 能据此换条思路)。

---

## 五、典型用例(都给可直接用的代码)

### 5.1 改 ts 文件后自动 prettier

`.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [{ "type": "command", "command": ".claude/hooks/fmt.sh" }]
    }]
  }
}
```

`.claude/hooks/fmt.sh`:

```bash
#!/usr/bin/env bash
file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

if [[ "$file" =~ \.(ts|tsx|js|jsx|json|md)$ ]]; then
  bunx prettier --write "$file" 2>&1 | head -20
fi
```

### 5.2 提交前阻断危险命令

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{ "type": "command", "command": ".claude/hooks/guard.sh" }]
    }]
  }
}
```

`.claude/hooks/guard.sh`:

```bash
#!/usr/bin/env bash
cmd=$(jq -r '.tool_input.command')

# 命中即阻断,exit 2
if echo "$cmd" | grep -qE '(rm -rf /|git push --force|drop database|truncate table)'; then
  echo "拦截危险命令: $cmd" >&2
  exit 2
fi

exit 0
```

LLM 看到 stderr 反馈,会知道"刚才这条不能跑"并改主意。

### 5.3 改 .py 文件自动跑 mypy

```bash
#!/usr/bin/env bash
file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0
[[ "$file" =~ \.py$ ]] || exit 0

err=$(uv run mypy "$file" 2>&1)
if [ $? -ne 0 ]; then
  echo "$err" >&2
  exit 2  # 阻断,把类型错误回灌给 LLM
fi
```

LLM 改完 py 文件后,如果 mypy 报错,**hook 直接把错误反馈给它,LLM 自动修复再重试**。这是闭环自动化的核心模式。

### 5.4 Stop 时自动 git status 总结

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{ "type": "command", "command": ".claude/hooks/summary.sh" }]
    }]
  }
}
```

```bash
#!/usr/bin/env bash
echo "=== 本轮改动总结 ==="
git status -s
echo ""
echo "=== diff stats ==="
git diff --stat
```

每次 Claude 停下来都打印 git 状态,你看一眼就知道这轮改了哪些。

### 5.5 UserPromptSubmit 注入上下文

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "*",
      "hooks": [{ "type": "command", "command": ".claude/hooks/inject.sh" }]
    }]
  }
}
```

```bash
#!/usr/bin/env bash
# 把当前 git 分支信息注入到每个 prompt 前
echo "[当前分支] $(git branch --show-current)"
echo "[未提交改动] $(git diff --stat | tail -1)"
```

stdout 会被作为附加 context 注入给 LLM。**慎用**——每条都注入太多上下文会膨胀 token。

### 5.6 SessionEnd 自动归档 transcript

```bash
#!/usr/bin/env bash
transcript=$(jq -r '.transcript_path')
mkdir -p ~/.claude/archives
cp "$transcript" ~/.claude/archives/$(date +%Y%m%d-%H%M%S).jsonl
```

---

## 六、阻断 vs 反馈的设计哲学

Hook 有两种风格:

### 6.1 硬拦截(`exit 2`)

适合"绝对不能做"的事:删数据、`force-push` 到 main、读密钥文件。

### 6.2 软反馈(stdout、`exit 0`)

适合"做了之后还可以补救"的事:格式化、跑测试、补 import。**让 LLM 看到结果,自己判断要不要改**。

> 选错会很烦:把"格式化"做成硬拦截,改一次代码 LLM 撞墙 10 次;把"删数据库"做成软反馈,某天它真的删了。**破坏性操作硬拦,辅助性操作软反馈**,这条几乎万能。

---

## 七、`UserPromptSubmit` 的特殊用途:防注入

UserPromptSubmit hook 可以**直接拒绝某些用户输入**(比如带敏感词、带绝对路径)。这是企业部署 Claude Code 时的常见钩子:

```bash
#!/usr/bin/env bash
prompt=$(jq -r '.prompt')

# 拒绝包含特定词的 prompt
if echo "$prompt" | grep -qiE '(传秘钥|leak|exfiltrate)'; then
  cat <<EOF
{
  "decision": "block",
  "reason": "prompt 命中安全规则,被拒"
}
EOF
  exit 0
fi

exit 0
```

---

## 八、Hook 在三层 settings 的合并行为

每一层的 `hooks.<event>` 都会被**合并**到一起跑——不像 model 那样后面覆盖前面。**所以**:

- user 层写一个全局 hook,project 层再加一个项目专属的,**两个都跑**
- 想关掉 user 层的某个 hook,在 project 层不能"覆盖",只能改 user 层

这意味着**hook 是叠加而不是覆盖**——团队公共 hook 写 project,个人调试 hook 写 local,清晰。

---

## 九、调试 hook 的几条铁律

1. **stdin 是 JSON**——你的脚本第一行就该 `input=$(cat)`,不要忘
2. **stdout 会进 transcript / context,别 print 调试信息**——调试 print 到 **stderr**(`echo "..." >&2`)或写到 `/tmp/hook.log`
3. **`Ctrl+R` 看 transcript**——hook 跑了什么、输出了什么,全在 transcript 里
4. **先在 shell 里手动喂 JSON 跑一遍**:
   ```bash
   echo '{"tool_input":{"file_path":"foo.ts"}}' | .claude/hooks/fmt.sh
   ```
5. **chmod +x**——经常忘,导致 hook 报"permission denied"
6. **shebang 写好**——`#!/usr/bin/env bash` 比 `#!/bin/bash` 跨平台更稳

---

## 十、用 update-config skill 配 hook

Claude Code 自带一个 skill `update-config`,你不用手写 JSON——直接说"每次改 ts 文件后跑 prettier",它会用 update-config skill 帮你写进 settings.json。

```
你: 每次保存改动后跑 bunx prettier
Claude: (调 update-config skill)
       添加 PostToolUse hook,匹配 Edit|Write,跑 prettier
       要写到 user / project / local 哪一层?
```

> **第一次配 hook 强烈建议走 update-config**——比手写 JSON 不容易错,而且会自动建脚本文件。

---

## 十一、踩坑

1. **以为 prompt 里写"每次 X 都 Y"会生效**——LLM 不是确定性系统。**确定性的事一律 hook**
2. **stdout 调试信息污染了 LLM 上下文**——比如 hook 输出了 200 行 lint 警告,全进了下一轮 prompt。**调试输出去 stderr 或日志文件**
3. **PostToolUse 改文件后又触发自己**——格式化 hook 把文件改了,又触发 PostToolUse……写好 idempotency,或在脚本里检测"是否真的改了内容"
4. **`exit 2` 用错地方**——格式化的 hook `exit 2` 等于把每次 Edit 都拦下来,LLM 撞墙
5. **没处理 `tool_input.file_path` 为空**——某些工具(Bash)没有 file_path,你的脚本不该崩
6. **hook 跑得太慢**——每次 Edit 都跑全项目 lint,等 30 秒一次。**只跑被改的文件**
7. **写在 user level 害了别人**——其实不会,user level 只影响你自己。但**写在 project level 但只想自己用**才是问题(同事 pull 下来都跑你的 hook)
8. **hook 脚本依赖某个全局工具,同事没装**——`prettier` `mypy` 你装了别人没装,hook 全员失败。**写到 README,或者 hook 里检测命令存在再跑**
9. **hook 里跑长任务**——每个 prompt 都等 5 秒,体验崩坏。**长任务 background,或者改成 manual slash**
10. **不知道有 update-config skill**——手写 JSON 错一个逗号 hook 全挂。**让 Claude 自己配,它有 skill**

---

下一篇:`06-MCP在Claude-Code里的用法.md`,AI 系列已经讲过 MCP 协议本身,这里站在"我是 Claude Code 用户"的角度:三层 mcp 配置(`.mcp.json` / user-level / local)、典型 server 配方、`enableAllProjectMcpServers` 这种安全开关、远程 server 鉴权、和 `.claude/settings.json` 的 `enabledMcpjsonServers` 怎么配合。
