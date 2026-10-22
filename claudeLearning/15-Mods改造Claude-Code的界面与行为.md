# Mods:改造 Claude Code 的界面与行为

前面讲的扩展机制都是从"外面"影响 Claude Code:skill 给它知识,MCP 给它工具,settings 里的 hook 在事件上跑一段脚本。**mod 则是跑在 Claude Code 进程里面的代码**:用 JavaScript 或 TypeScript 写的事件处理函数,能在对话旁边画一个面板、在输入框上方加一条信息带、改写一次工具调用、加一个不经过模型就立刻执行的命令。

`/diff` 的 diff 面板、读取 `AGENTS.md` 的功能,本身就是 Claude Code 内置的 mod。

> 一句话先记住:**mod 是"给 Claude Code 自己写插件"**。其他扩展改变 Claude 知道什么、能做什么;mod 改变 Claude Code 这个程序长什么样、怎么处理事件。能力最强,风险也最大——它以你的权限运行,而且不在沙箱里。

---

## 一、mod 能做什么

| 能力 | 例子 |
| --- | --- |
| **画可交互的界面** | 对话旁边的面板、输入框上方的信息带,带标签页、按钮、输入框 |
| **重画 Claude Code 自己的界面** | 替换或改样式:工具调用那一行、spinner、提问对话框 |
| **介入工具调用和请求** | 拦下一个工具调用先问你、不执行工具直接给出结果、把某个请求发给另一个模型 |
| **添加命令** | `/standup` 这样的命令,**直接运行你的函数,不开启 Claude 的一轮**,Claude 工作时也能用 |
| **添加工具** | 注册一个 Claude 可以调用的工具 |
| **在 hook 之间共享数据** | 一个 hook 统计工具调用次数,另一个把次数显示在 spinner 旁边 |

一个能力对照:

| | Mod | Settings hook | Skill | MCP server |
| --- | --- | --- | --- | --- |
| 是什么 | Claude Code 进程里的函数 | 事件上运行的命令 / HTTP / prompt | Claude 读的指令 | 外部进程或服务 |
| 能改什么 | 工具调用、prompt、命令、轮次、界面 | 是否放行、工具参数和结果、追加的上下文 | Claude 知道什么、做什么 | Claude 有哪些工具 |
| 能画界面 | **能** | 不能 | 不能 | 不能 |
| 用什么写 | JavaScript / TypeScript | 脚本 + settings 条目 | Markdown | 任何语言 |
| 选它当 | 要面板、信息带、自定义命令、改写事件 | 用现成脚本拦截、放行、记录事件 | 反复粘贴同样的指令 | Claude 需要外部系统的工具 |

---

## 二、一个最小的 mod

mod 本质上是一个插件,只是带了一个"hooks 模块":

```
first-mod/
├── .claude-plugin/
│   └── plugin.json
└── hooks/
    ├── hooks.json      # 指向你的代码文件
    └── register.js     # 你的代码
```

`register.js`:统计工具调用次数,显示在 spinner 旁边,效果是 `Thinking · tool calls: 3…`。

```javascript
// 两个 hook 共享的计数
let calls = 0

// mod 加载时 Claude Code 调用一次
export function register(on) {
  // Claude 每次准备使用工具时运行
  on('tool.call', async ($, e, next) => {
    calls += 1
    $.ui.invalidate('ui.render')   // 请求重绘界面,让新计数显示出来
    return next(e)                 // 让工具照常运行
  })

  // Claude Code 每次绘制 spinner 时运行
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // 保留原来的 spinner,只在后面加上计数
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
```

### 一个 hook 对事件能做三件事

| 做法 | 写法 | 例子 |
| --- | --- | --- |
| **观察** | 记录点什么,然后 `return next(e)` 原样放行 | 上面的 `tool.call` |
| **改写** | 修改事件再交给 `next` | 上面的 `ui.render` 给 spinner 加后缀 |
| **应答** | 不调用 `next`,自己返回结果,原本的行为就不会发生 | 拒绝一个命令 |

hook 要做任何"自身代码之外"的事——画界面、加命令、调模型、读文件、起进程、发网络请求——**都必须通过 mods API(`$`)**。正因为如此,Claude Code 才能在不运行 mod 的情况下列出它会做什么(见第七节)。

---

## 三、最省事的方式:让 Claude 写

```
写一个 mod,在输入框上方显示当前 git 分支
```

Claude 会用内置的 `plugin-authoring` skill,把 mod 写进这个会话专属的 mods 目录(`~/.claude/dev-mods/` 下)。流程:

1. Claude 保存第一个文件时,会问你是否为本会话**开启热重载**
2. 选 **Enable for this session**:这一轮结束时 mod 加载;之后每一轮改了 mod 的文件,结束时自动重载
3. `/plugin` 的 Installed 标签页能看到它
4. 不满意就继续告诉 Claude 改哪里

Claude 写的 mod **只在创建它的会话里加载**,而且会话目录过期后会被清理。想长期使用,把目录复制出来,用 `claude --plugin-dir ~/mods/git-branch` 加载,或者放进 marketplace 分发给别人。

`-p` 运行、`dontAsk` 模式、未信任的目录里,Claude 写的 mod 不会加载——这些场景下没人能批准它。

---

## 四、画界面

### 4.1 两个主要位置

| 位置 | 说明 | 匹配条件 |
| --- | --- | --- |
| **面板(Pane)** | 宽的 fullscreen 终端里是对话旁边的侧栏,否则是输入框上方的一块区域;多个面板各有标签页 | `{ component: 'Pane' }`,并检查 `e.requestId` 是你的 id |
| **信息带(AbovePrompt)** | 输入框正上方的一条,一直存在,所有 mod 共用 | `{ component: 'AbovePrompt' }` |

面板需要调用 `$.ui.open({ id: 'my-pane' })` 才会出现。信息带所有 mod 共用,你返回的内容会替换排在你后面的 mod 画的内容,想保留它们就把 `await next(e)` 的结果一起放进去。

### 4.2 其他要点

- 用元素组成一棵树来描述界面:文字、按钮、输入框、链接、彩色格子
- 响应按键和输入,设置快捷键
- 数据变化时调用 `$.ui.invalidate` 请求重绘,也可以定时重绘
- 用 `$.state` 保存状态,`/clear` 之后也能读回来
- 还能**重画 Claude Code 自己画的部分**,比如某种工具调用的显示方式

在哪里能看到 mod 画的东西:终端(含编辑器集成终端和 JetBrains)和 Desktop App 的 Code 标签页可以;VS Code 扩展较新版本可以;`-p`、Agent SDK、云端会话里 hook 照样运行,但**不显示界面**。所以画界面的 mod 应该检查自己运行在哪,在不能绘制的地方退回到在对话里打印一行。

---

## 五、介入工具调用

拦下强制推送,并告诉 Claude 为什么:

```javascript
on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
  if (/git push .*--force/.test(e.command)) {
    // 不调用 next 就是"应答",命令不会执行,也不会弹出授权窗口
    return { deny: '这个仓库禁止强制推送。请推到一个新分支。' }
  }
  return next(e)   // 其他命令照常进入权限检查,再交给 Bash
})
```

`deny` 的文字会作为工具结果交给 Claude,所以要写成它能照着做的指令。

在工具运行**之后**做事:先 `await next(e)` 拿到结果,做完你的事再原样返回:

```javascript
on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
  const result = await next(e)
  const changed = !result.deny && !result.isError
  if (changed && e.file_path.endsWith('.mdx')) $.ui.log('Claude 修改了 ' + e.file_path)
  return result
})
```

hook 还可以修改调用参数、重试、替换结果、扣下结果不给 Claude。除了 `tool.call`,还能改写或追加 prompt、跟踪一轮的进行、处理 settings hook 对应的那些事件。

---

## 六、加命令、加工具、调模型

### 6.1 命令:给用户用

```javascript
on('session.start', async ($, e, next) => {
  await $.command.register({ name: 'standup', description: '总结今天的改动', argumentHint: '[days]' })
  return next(e)
})

on('command.run', { command: 'standup' }, async ($, e) => {
  return { text: '最近 ' + (e.args || '1') + ' 天的改动:...' }
})
```

返回的 `text` 打印在对话里,Claude 也能读到。命令名不能和内置命令重名。

### 6.2 工具:给 Claude 用

用 `$.tool.register` 注册名字、描述和输入的 JSON Schema。Claude 看到的名字是 `mcp__<插件名>__<工具名>` 这样的形式,权限规则也按这个名字写。

### 6.3 调模型

| | `$.model.complete` | `$.model.fork` |
| --- | --- | --- |
| 模型 | 你指定的 | 会话的模型 |
| 消息 | 只有你的 prompt | 当前完整对话 + 你的 prompt |
| CLAUDE.md 等项目上下文 | 不含 | 含 |
| 缓存 | — | 复用会话的缓存,便宜 |

适合分类、总结这类小任务,比如一个 `/triage` 命令让小模型给输入的文字打标签。**用的是会话的凭证,花的是用户的额度或 API 费用**。

### 6.4 其他

- 后台运行任务、不开启一轮就在界面上显示信息、从后台任务里开启一轮
- 在会话之间收发消息
- 读写文件、启动进程、访问网络(都通过 API)

---

## 七、安全:mod 能碰到什么

mod 以你的权限运行在 Claude Code 里,加载后它能:

- **以你的身份操作机器**:读写你的账号能访问的任何文件、启动程序、发网络请求
- **读你的密钥**:环境变量和 settings 文件,包括放在里面的 API key
- **看到你的会话**:你发的每条消息、Claude 的每次工具调用
- **改变你的会话**:改写 prompt 或工具调用、以你的名义提交 prompt、给你的其他会话发消息
- **不问你就行动**:在你被询问之前批准一个工具调用
- **花你的额度**:用你的计划或 API key 调模型

**mod 不在沙箱里**。开了沙箱,沙箱隔离的是 Claude 跑的 Bash 命令,mod 启动的进程在沙箱外。mod 唯一改不了的界面是**权限弹窗**——它不能篡改弹窗给你看的内容。

### 安装前先看它会做什么

```bash
claude plugin validate ./some-mod
```

输出里的 `hooks:` 和 `calls:` 两行列出它处理哪些事件、会请求 Claude Code 做什么(读文件、发网络请求等),**不需要运行它**。

### 关于权限的边界

在有 managed settings、或用 Team / Enterprise 账号登录的会话里,默认情况下 mod 的批准**越不过**你的 ask 规则、deny 规则和 PreToolUse hook。用 API key 或长期令牌、且没有 managed settings 时,mod 的批准可以越过这些——所以个人使用时更要谨慎选择安装哪些 mod。

---

## 八、开关与组织管控

- **单个 mod**:在 `/plugin` 的 Installed 标签页停用或卸载
- **本次会话所有已安装的 mod**:`claude --safe-mode`
- **所有会话所有你安装的 mod**:`~/.claude/settings.json` 里设 `"disableAllHooks": true`(settings hooks 和自定义状态栏也会一起停)
- 内置 mod 不受以上开关影响
- `/plugin` 标签页下方会显示本会话加载了哪些 mod,如 `1 mod active · first-mod`

管理员可以通过内置的守护 mod 设置 `allowManagedModsOnly`,让用户自己安装的 mod 都不加载,只运行组织提供的;也可以用自己写的 mod 来强制执行组织策略。

---

## 九、开发与测试

- 从 Anthropic 的 `claude-code-playground` 仓库里有示例 mod:`token-weather`(在输入框上方画上下文窗口的"天气预报")、`blast-radius`(拦下 `rm -rf`、强制推送这类危险命令,展示影响范围,给出继续 / 取消按钮)、`replay-theater`(用 `/replay` 回放上一轮 Claude 做的文件修改)
- 可以获取当前版本的 TypeScript 类型定义
- 可以写自动化测试:触发事件、模拟 Claude Code 的 API,验证 mod 的行为
- mod 不起作用时,先确认版本(终端 v2.1.287+)、是否被 `disableAllHooks` 或组织策略挡住、`/plugin` 里有没有列出它

---

## 十、踩坑

1. **从来路不明的地方装 mod**——它以你的完整权限运行,能读你的密钥、能替你批准工具调用
2. **以为沙箱能挡住 mod**——不能,mod 启动的进程在沙箱外
3. **装之前不跑 `claude plugin validate`**——看不到它会处理哪些事件、请求哪些能力
4. **hook 里忘了 `return next(e)`**——等于"应答"了事件,原本的行为不会发生
5. **画界面的 mod 不考虑 `-p` 和云端**——那里不显示界面,要有降级方案
6. **在共享的信息带里直接返回自己的内容**——会盖掉其他 mod 画的东西,用 `await next(e)` 合并
7. **Claude 写的 mod 用了几天发现没了**——它只在创建它的会话目录里,会被清理。复制出来长期保存
8. **`deny` 文字写成给人看的报错**——Claude 会读它,要写成它能照做的指令
9. **调模型的 mod 频繁触发**——每次都花额度。高频事件里避免调模型
10. **能用 settings hook 解决的也写成 mod**——只是拦截或记录事件,用现成脚本更简单

---

第二层到这里结束:skills、hooks、MCP、子代理、插件、mod——**把团队的知识、流程、工具装进 Claude Code** 的全部手段。下一层讲**一群 Claude 同时干活、离开电脑也在干活**。

下一篇:`16-并行Agent-worktree与agent-teams.md`,讲用 worktree 隔离并行会话、用 agent view 管理一堆后台会话、用 agent teams 协调多个 Claude、以及会话之间怎么互发消息。
