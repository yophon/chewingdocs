# IDE 集成与 statusline

Claude Code 是终端原生的,但**它不排斥 IDE**——反而在 VSCode / Cursor / JetBrains 里的体验比纯终端更顺手。这一篇讲清三件事:**怎么把 Claude Code 嵌进 IDE、怎么自定义状态栏、怎么改 output style**。这三件事每一件都不是必装,但装上之后日常体验会跨一个台阶。

> 一句话先记住:**IDE 集成 = "在编辑器里用 Claude Code 而不是切到外部终端"**;**statusline = "在底部知道当前 session 状态"**;**output style = "改 Claude 回复的语气和详略"**。三件事都是"好用"层面的,**不影响功能**。

---

## 一、IDE 集成的工作方式

Claude Code 是 CLI,IDE 集成的本质是:**在 IDE 里启动一个 Claude Code 进程,让它和当前打开的编辑器双向通信**。

通信通道做了两件事:

1. **当前文件 / 选中代码自动作为 context**——你在编辑器里选了一段代码,在 Claude Code 里直接 "@selection"
2. **diff 在 IDE 里展示**——LLM 改完文件,你在编辑器里看到 inline diff,而不是终端文本

支持的 IDE:

| IDE | 集成方式 |
| --- | --- |
| VSCode / Cursor / Windsurf | 官方扩展(直接在 marketplace 装) |
| JetBrains 全家桶(IntelliJ / PyCharm / WebStorm) | 官方插件 |
| Zed | 命令行启动即可,自动检测 |
| Vim / Neovim | 第三方插件,体验略弱(无 diff UI) |

---

## 二、装 VSCode / Cursor 扩展

```
1. 在 VSCode / Cursor 扩展市场搜 "Claude Code"
2. 装官方扩展
3. 在编辑器里 Cmd+Esc(macOS)/ Ctrl+Esc(Windows/Linux)调起 Claude Code 面板
```

**面板和终端 Claude Code 是同一个进程**——你可以选择嵌入式面板,也可以右上角"在外部终端打开"。

### 2.1 关键功能

- **selection → context**:在编辑器选一段代码,Claude Code 输入框里 `@selection`(或自动注入)
- **inline diff**:LLM 提议改文件 → 编辑器里直接看 diff,你点 accept / reject
- **打开文件直接 @-提到**:输 `@` 触发文件选择
- **显示 cwd 和 git 分支**:面板顶部一直可见

> Cursor 用户特别注意:Claude Code 不会替代 Cursor 自己的 LLM 功能(autocomplete、`Cmd+K`),**两者并存**。Cursor 自带的是"在编辑器里小步增强",Claude Code 是"派任务大步推进"。

---

## 三、`/ide` 命令

终端启动 Claude Code 时,如果当前你已经在 VSCode 终端里,Claude Code 会自动检测并提示连接 IDE。手动也行:

```
/ide
```

会列出当前可连接的 IDE,选一个,链路打通后:

- selection 自动注入
- diff 在 IDE 里展示
- terminal 输出仍在 Claude Code 这一侧

---

## 四、JetBrains 集成

JetBrains 全家桶(IntelliJ / PyCharm / WebStorm / GoLand …)装官方插件:

```
Settings → Plugins → 搜 Claude Code → Install
```

启动后顶部菜单 "Tools → Claude Code"(或快捷键)调起。**功能和 VSCode 大致一致**,UI 风格按 JetBrains 的来。

---

## 五、Statusline:底部状态栏

Statusline 是终端 Claude Code 底部那条彩色信息——默认显示模型、cwd、token 用量等。**它完全可定制**——你的脚本输出什么,它就显示什么。

### 5.1 配置入口

`~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "$HOME/.claude/statusline.sh"
  }
}
```

### 5.2 脚本协议

脚本读 stdin 拿到一个 JSON,echo 字符串到 stdout,Claude Code 把这个字符串渲染到底部。

输入 JSON 字段:

```json
{
  "session_id": "...",
  "model": "claude-sonnet-4-7",
  "cwd": "/Users/.../project",
  "transcript_path": "...",
  "version": "1.x.x",
  "output_style": "default"
}
```

### 5.3 一份能直接用的 statusline.sh

```bash
#!/usr/bin/env bash
# ~/.claude/statusline.sh
input=$(cat)

model=$(echo "$input" | jq -r '.model // "?"')
cwd=$(echo "$input" | jq -r '.cwd // "?"')

# 缩短 cwd 显示
short_cwd="${cwd/#$HOME/~}"
short_cwd=$(echo "$short_cwd" | awk -F/ 'NF>3{print $1"/.../"$(NF-1)"/"$NF; next}{print}')

# git 分支
branch=""
if git -C "$cwd" rev-parse --git-dir &>/dev/null; then
  branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
  dirty=""
  if [ -n "$(git -C "$cwd" status --porcelain 2>/dev/null)" ]; then
    dirty="*"
  fi
fi

# 模型简写
case "$model" in
  *opus*)   m="OPUS"   ; color="\033[35m" ;;  # 紫
  *sonnet*) m="SONNET" ; color="\033[36m" ;;  # 青
  *haiku*)  m="HAIKU"  ; color="\033[32m" ;;  # 绿
  *)        m="$model" ; color="\033[37m" ;;
esac
reset="\033[0m"
dim="\033[2m"

# 输出
printf "${color}[%s]${reset} ${dim}%s${reset}" "$m" "$short_cwd"
[ -n "$branch" ] && printf " ${dim}|${reset} \033[33m%s%s${reset}" "$branch" "$dirty"
```

```bash
chmod +x ~/.claude/statusline.sh
```

效果:

```
[SONNET] ~/.../project | main*
```

### 5.4 加点料的 statusline

可以叠加显示:

- token 用量(从 transcript 里 grep)
- 当前 plan mode / accept-edits 模式
- 后台正在跑的 background bash 数
- 上一条 hook 的状态

但**别叠太多**——statusline 是给你瞥一眼的,信息密度太高反而干扰。**3-5 段信息封顶**。

---

## 六、Output Style:换 Claude 的回复风格

Output style 是预设的"回复人设":影响详略、语气、是否带头尾总结。

### 6.1 内置风格

- `default` —— 平衡,日常用
- `explanatory` —— 多解释,适合学习
- `learning` —— 引导式,问问题让你思考
- `concise` —— 极简,只给结论(2026 年新加的)

切换:

```
/output-style explanatory
```

或写到 settings:

```json
{ "outputStyle": "concise" }
```

### 6.2 自定义 output style

`~/.claude/output-styles/no-yapping.md`:

```markdown
---
name: no-yapping
description: 不啰嗦,直接给结论和命令
---

回复风格:

- 不要 "Sure!" / "I'll help you" / "Let me..." 这类客套
- 不要末尾总结刚才做了什么(用户能看见)
- 不要解释你为什么不做某事(直接做或不做就好)
- 命令和 diff 是产物,不需要再用文字复述
- 如果你想说"也许应该考虑 X",直接说"X 更好,做 X 吗"
```

切换:

```
/output-style no-yapping
```

> Output style 改的是**回复风格**,不改能力。**写 output style 的时候像在写 prompt 给一个新员工讲清楚"我喜欢什么风格"**。

---

## 七、Keybindings:几个高频快捷键

终端里几个关键操作:

| 键 | 作用 |
| --- | --- |
| `Tab` | 自动补全(命令、文件、slash) |
| `Esc` | 中断当前 LLM 响应 |
| `Ctrl+C` | 完全退出 |
| `Ctrl+R` | transcript 模式(看完整对话历史 / 工具调用) |
| `Ctrl+L` | 清屏(不清 context) |
| `Shift+Tab` | 切 permission mode(default / acceptEdits / plan 循环) |
| `Up` / `Down` | 浏览历史输入 |
| `Cmd+Esc`(IDE) | 调起 Claude Code 面板 |

`~/.claude/keybindings.json` 可以自定义。日常很少改;**最值得学的是 `Ctrl+R`**——出问题第一反应是按它看 transcript。

---

## 八、`/install-github-app`:Claude Code 进 CI

Claude Code 不只跑在你本地——也能跑在 GitHub Actions 里:

```
/install-github-app
```

它会引导你装 Anthropic 的 GitHub App,绑定仓库,**之后你在 PR 评论里 @claude-code 就能让它帮你改代码**:

```
@claude-code 把这个 PR 里所有 console.log 替换成 logger.info
```

CI 跑一个 Claude Code session,改完直接 push 一个新 commit 到 PR。

**适合的场景**:

- 团队有些重复改造工作(比如批量修改 deprecated API)
- 自动化 PR 整理(rebase / 解决冲突 / 跑 lint 修复)
- 文档自动维护

**不适合**:

- 安全敏感改动(代码进 CI 等于代码出 sandbox)
- 需要业务上下文判断的事(LLM 在 CI 里没有你坐在屏幕前的对话上下文)

---

## 九、`/help` / `/status` / `/cost`:三个最常用元命令

| 命令 | 作用 |
| --- | --- |
| `/help` | 列所有 slash command + 简介 |
| `/status` | 当前 session 的有效配置(model、permissions、hooks、MCP servers、CLAUDE.md 路径) |
| `/cost` | token 用量 + 估算费用 |
| `/clear` | 清 context,保留 settings |
| `/compact` | 主动压缩上下文(自动也会触发,长 session 手动一次能清不少) |
| `/model` | 切模型 |
| `/permissions` | 临时改 permission mode |
| `/mcp` | 看 MCP server 状态 |
| `/skills` | 看可用 skill |

> `/cost` 是最被忽略的——很多人以为 Claude Code 不贵,看一次会发现一天能跑出几美元到几十美元。**养成每天看一次的习惯,异常时立刻定位**。

---

## 十、踩坑

1. **不装 IDE 扩展**——选代码 → 复制 → 粘贴到终端 Claude Code,效率比直接 @selection 低 5 倍
2. **statusline 脚本写到 stderr 调试**——结果脚本本身没 echo 任何东西,statusline 是空的
3. **statusline 跑得太慢**——每次刷新都要等;**保持 statusline 脚本毫秒级**,别在里面跑长命令
4. **statusline 信息太多**——满屏花花绿绿,反而看不见关键的"当前模型"
5. **output style 改成 super-concise 后被坑**——某天它不解释操作了你不知道发生了啥;**学习/调试用 default,熟练后再 concise**
6. **`Ctrl+R` 不学**——出问题完全靠猜;一按 `Ctrl+R` 立刻看到 LLM 调了哪些工具、传了什么参数
7. **GitHub App 装在敏感 repo**——CI 里跑 Claude 要写权限,**先装在低敏感仓试用,再扩展**
8. **JetBrains 用户没装插件**——一直在外部终端跑,以为 IDE 集成只 VSCode 能用
9. **`/cost` 从不看**——某月账单上千美元才发现某 hook bug 导致每条 prompt 多调了 50 次 API
10. **改了 statusLine / outputStyle 不重启 session**——这俩需要新 session 才完全生效;改完 `/clear` 或重开

---

## 十一、第一层(工作流)结束语

到这里,**会用 Claude Code 的全部内容**已经讲完:

```
01 总览                  心智模型
02 settings              三层配置
03 工具与权限             Read/Edit/Write/Bash/Glob/Grep + permissions
04 Slash Commands        手动触发的 prompt 模板
05 Hooks                 事件触发的脚本
06 MCP                   外接工具协议
07 Subagents             派子任务
08 Skills                按需激活专业知识
09 Plan Mode             先想清楚再动手
10 Memory / CLAUDE.md    项目背景注入
11 IDE / Statusline      日常体验定制
```

这 11 篇之后,你已经能:

- 配出适合你团队的 Claude Code 工作环境
- 写自定义 slash / hook / skill / subagent
- 接 MCP server 让 Claude 能用你的内部工具
- 用 plan mode 控住大改造
- 让团队新人 clone 项目就能马上用上

下一篇 `12-Anthropic-API入门.md` 进入第二层——**自己写应用**。如果你只是用 Claude Code 不写应用,从这里跳到 `28-Skill设计模式.md` 也行;但 12-23 这一段会让你理解"为什么 Claude Code 是这样设计的"——因为你看完会发现,**Claude Code 自己就是一个用 Anthropic API + Agent SDK 写出来的 Coding Agent**。
