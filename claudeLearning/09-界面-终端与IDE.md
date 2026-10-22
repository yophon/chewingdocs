# 界面、终端与 IDE

前八篇讲的是 Claude Code"能做什么"。这一篇讲"**怎么用得顺手**":终端怎么配、有哪些快捷键和输入方式、怎么随时看 diff、怎么定制状态栏和回复风格,以及在 VS Code、JetBrains 里怎么用。这些都是小事,但每天要做几百次,一点点顺手加起来就是很大的效率差。

> 一句话先记住:**终端里的 Claude Code 是一个完整的交互环境,不只是一个输入框**。`!` 直接跑命令、`@` 引用文件、`Ctrl+G` 打开编辑器、`/diff` 看改动、`/btw` 问旁支问题——把这几样用熟,大部分"切出去看一眼"的动作都可以省掉。

---

## 一、终端配置

### 1.1 多行输入

| 方式 | 说明 |
| --- | --- |
| `\` + `Enter` | 所有终端都能用 |
| `Shift+Enter` | iTerm2、WezTerm、Ghostty、Kitty、Warp、macOS 终端、Windows Terminal 原生支持 |
| `Option+Enter` | macOS 上开启 Option as Meta 之后 |
| `Ctrl+J` | 任何终端,无需配置 |
| 直接粘贴 | 适合代码块和日志 |

### 1.2 几项值得做的配置

- **macOS 开启 Option as Meta**:很多快捷键(`Alt+B` / `Alt+F` 按词移动、`Option+P` 切模型、`Option+T` 切 thinking)依赖它
- **通知**:任务完成或等待授权时响铃或弹通知。settings 里的 `preferredNotifChannel` 可以设成 `terminal_bell`
- **主题**:`/theme` 选择,也可以自定义主题,甚至打包进插件分发
- **tmux**:按官方文档调整配置,否则部分按键和渲染会有问题
- **Vim 模式**:settings 里设 `"editorMode": "vim"`,输入框支持 NORMAL / INSERT / VISUAL 模式

### 1.3 fullscreen 渲染

```
/tui fullscreen    # 切换,会保存设置并保留当前对话
/tui default       # 切回经典渲染
```

fullscreen 渲染像 `vim` 一样接管终端的绘制区域:**不闪烁、长对话内存占用稳定、支持鼠标**。在 VS Code 集成终端、tmux、iTerm2 这类渲染吞吐受限的终端里差别最明显。它还解锁了几项功能:`?` 打开快捷键面板、`{` / `}` 在你的消息之间跳转、`[` 把整段对话写进终端原生回滚缓冲区方便搜索,以及下面要讲的 diff 面板。

---

## 二、快捷键

### 2.1 最常用的一组

| 快捷键 | 作用 |
| --- | --- |
| `Esc` | 打断当前回复或工具调用,已完成的工作保留 |
| `Esc` `Esc` | 输入框有字时清空(草稿进历史,按上键找回);输入框为空时打开回退菜单 |
| `Shift+Tab` | 切换权限模式 |
| `Ctrl+C` | 打断;没有运行中的操作时,第一次清空输入,第二次退出 |
| `Ctrl+O` | 打开记录查看器:看每次工具调用的细节、时间戳和所用模型 |
| `Ctrl+R` | 反向搜索历史输入,**跨所有项目** |
| `Ctrl+G` | 在默认编辑器里编辑当前输入(写长 prompt 时很有用) |
| `Ctrl+B` | 把正在运行的命令或子代理放到后台(tmux 里按两次) |
| `Ctrl+T` | 显示或隐藏 Claude 的任务清单 |
| `Ctrl+S` | 暂存当前输入,再按一次恢复 |
| `Ctrl+V` | 粘贴剪贴板里的图片(iTerm2 用 `Cmd+V`,Windows / WSL 用 `Alt+V`) |
| `Ctrl+L` | 屏幕显示乱了时强制重绘 |
| `Option+P` / `Alt+P` | 不清空输入的情况下切模型 |
| `Option+O` / `Alt+O` | 切换 fast mode |

### 2.2 输入框里的前缀

| 输入 | 作用 |
| --- | --- |
| `/` 开头 | 命令或 skill |
| `!` 开头 | shell 模式:直接跑命令 |
| `@` | 文件路径补全,引用文件或目录 |
| `?`(空输入时) | 快捷键帮助面板 |

### 2.3 自定义快捷键

`/keybindings` 创建或打开 `~/.claude/keybindings.json`,按上下文(Chat、diff 面板等)绑定或解绑按键,修改后立即生效。

---

## 三、几种高效的输入方式

### 3.1 `!` shell 模式

```
! npm test
! git status
```

命令直接执行,**不经过 Claude 的判断和授权**,输出进入对话,然后 Claude 会自动针对输出回应——跑完 `! npm test`,不用再说一句"帮我看看为什么失败",它就会开始分析。

注意:大多数会话里,你用 `!` 输入的命令**不在沙箱里运行**。它是你自己的命令,由你负责。

### 3.2 边干活边插话

Claude 工作时你可以直接打字回车,消息进入**队列**:它会在当前这批工具调用结束后读到,并在同一轮里调整方向。`Ctrl+Enter` 让队列里的消息立刻发出。

### 3.3 `/btw`:问一句不进历史的旁支问题

```
/btw 刚才那个配置文件叫什么来着?
```

它根据已有对话回答,**不写进对话历史**,不污染上下文;Claude 正在工作时也能问,不会打断主任务。

### 3.4 引用文件和图片

- `@src/auth/session.ts` 引用文件,`@src/auth/` 引用目录(给的是目录列表)
- 拖入或粘贴截图,输入框里会出现 `[Image #1]` 占位,可以在文字里按编号引用
- 在 IDE 里还能带行号范围:`@src/auth.ts#L1-99`

---

## 四、随时看改动:`/diff`

```
/diff
```

- **fullscreen 渲染下**:diff 面板在对话旁边打开,并随着 Claude 改文件、跑命令实时刷新。终端宽度够(144 列以上)时,Claude 一开始改文件面板就会自动出现
- **经典渲染下**:在输入框上方弹出一个 diff 对话框

面板里可以:点文件跳转;点 `ask` 把这个文件的 diff 附到下一条消息里问 Claude;用 `source` 选择器只看某一轮(T1、T2……)的改动;按 `Ctrl+X B` 在"本会话改动 / 所有未提交改动 / 相对默认分支的全部改动"之间切换对比基准。

> 有了 diff 面板,"边看边审"变得很自然。**不要等它全部做完才看 diff**,在它做的过程中就看,发现方向不对立刻按 `Esc` 纠正。

---

## 五、状态栏

状态栏是输入框下方的一行,由你提供的命令生成。最省事的方式是用自然语言让 Claude 帮你写:

```
/statusline 显示模型名和上下文占用百分比,带一个进度条
```

它会在 `~/.claude/` 里生成脚本并更新 settings。也可以手动配置:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 2
  }
}
```

脚本从 stdin 读到一个 JSON,里面有模型、上下文占用、会话、git 分支、花费等信息。状态栏随事件刷新;要显示时钟这类按时间变化的数据,加 `refreshInterval`(秒)。

---

## 六、output style:改变回复风格

output style 是一组作用于**整个会话**的指令,改变 Claude 的角色、语气和回复格式。除了默认风格,内置四种:

| 风格 | 变化 | 适合 |
| --- | --- | --- |
| **Proactive** | 立刻动手,常规决策自己拿主意,不停下来问 | 你愿意事后纠偏,想让它一口气推进 |
| **Concise** | 先给结果,省掉开场白、过程叙述和总结 | 默认回复太长 |
| **Explanatory** | 加入简短的 `Insight` 块解释代码背后的选择 | 熟悉新代码库、想知道为什么这么写 |
| **Learning** | 解释思路,并留一小部分代码让你自己写 | 边完成任务边练手 |

切换:`/output-style Concise`,或在 `/config` 里选。下一条消息开始生效,**不会让缓存失效**。

自定义风格是一个 Markdown 文件,放在 `~/.claude/output-styles/`(个人)或 `.claude/output-styles/`(项目):

```markdown
---
name: Diagrams first
description: 解释时先画图
keep-coding-instructions: true
---
解释代码、架构或数据流时,先用 Mermaid 图展示结构,再用文字说明。
控制流用 flowchart TD,请求路径用 sequenceDiagram,每张图不超过 15 个节点。
```

`keep-coding-instructions: true` 表示保留 Claude Code 内置的软件工程指令,只改沟通方式;不写的话,它会把自己当成一个非编程角色。

> output style 和 CLAUDE.md 的分工:**CLAUDE.md 写"项目是什么样",output style 写"回答该怎么写"**。前者不管换什么风格都一直生效;后者可以随时换。两者都只是指令,必须保证执行的事交给 hook。

---

## 七、语音输入与无障碍

- **语音输入**:按住说话或点按录音后自动发送,可以切换识别语言、重新绑定按键
- **屏幕阅读器模式**:为 VoiceOver 等屏幕阅读器优化输出

---

## 八、VS Code

### 8.1 上手

装 Claude Code 扩展(Cursor 也能装同一个扩展),然后:

- 点编辑器右上角的 Spark 图标打开面板,或者点左侧活动栏的图标打开会话列表
- 第一次打开时在面板里登录。shell 里设了 `ANTHROPIC_API_KEY` 却仍被要求登录,通常是 VS Code 没继承 shell 环境——用 `code .` 从终端启动
- **选中的代码会自动作为上下文**;`Option+K`(Mac)/ `Alt+K` 插入带行号的引用,如 `@file.ts#5-10`

### 8.2 审改动

输入框底部显示当前权限模式:

- **Auto 或自动编辑模式**:直接改工作区里的大部分文件
- **Manual 模式**:每次修改都弹出左右对比,可以接受、拒绝,或告诉它换个做法;还能**逐处**接受或拒绝(超过 100 处改动时只能整体审)

### 8.3 和 CLI 的差别

扩展支持 checkpoints、MCP 管理(`/mcp`)、插件管理、多会话分组、后台任务、Chrome 自动化等,但**命令和 skills 只是 CLI 的一个子集,`!` shell 模式不可用**。需要 CLI 独有功能时,在 VS Code 的集成终端里直接运行 `claude`。

---

## 九、JetBrains

JetBrains 插件(IntelliJ、PyCharm、WebStorm、GoLand、Android Studio 等)**需要另外安装 CLI**,它在 IDE 里提供:

- `Cmd+Esc`(Mac)/ `Ctrl+Esc` 从编辑器直接打开 Claude Code
- 代码改动在 **IDE 的 diff 查看器**里展示(可以在 `/config` 的 Diff tool 里改回终端)
- 当前选区和打开的文件自动共享给 Claude(`Read` 拒绝规则匹配的文件不会共享)
- `Cmd+Option+K` / `Alt+Ctrl+K` 插入文件引用
- Claude 能读取 IDE 的检查结果(lint、语法错误)

在 IDE 自带终端里跑 `claude` 会自动连接;在**外部终端**里跑的话,执行 `/ide` 连接到正在运行的 IDE。

---

## 十、踩坑

1. **多行输入总是被直接发出去**——终端不支持 `Shift+Enter`。用 `Ctrl+J` 或 `\` + 回车,或按文档配置终端
2. **macOS 上一堆 Alt 快捷键没反应**——没开 Option as Meta
3. **VS Code 集成终端里闪烁、滚动乱跳**——切到 `/tui fullscreen`
4. **用 `!` 跑危险命令以为有沙箱兜底**——`!` 是你自己的命令,通常不进沙箱
5. **等它全部做完才看 diff**——开着 diff 面板,边做边看,方向不对早打断
6. **把旁支问题直接问进主对话**——用 `/btw`,不污染上下文
7. **用 output style 约束必须执行的规则**——它只是指令,强制执行用 hook
8. **自定义风格忘了 `keep-coding-instructions`**——Claude 会丢掉内置的工程指令,编码行为变样
9. **在 VS Code 扩展里找 `!` 和某些命令**——扩展只支持子集,需要时在集成终端里跑 CLI
10. **外部终端跑 Claude Code 却享受不到 IDE 集成**——执行 `/ide` 连接

---

第一层到这里结束:装好、配好权限、管好会话和上下文、写好 CLAUDE.md、选对模型、会计划和设目标、用顺界面。从下一篇开始进入第二层,**把团队的知识、流程和工具装进 Claude Code**。

下一篇:`10-Skills技能与自定义命令.md`,讲 skill 的结构和加载方式、自定义 `/命令` 怎么写、谁来触发、frontmatter 有哪些字段,以及怎么写一个好用的 skill。
