# Slash Commands 自定义命令

Claude Code 的对话不全是"和 LLM 自由聊天"。一旦你发现某段 prompt 反复在用("帮我审 PR 时按这五点检查"、"提交前先检查这些"),就该把它变成一条 **slash command**——一个文件、一行触发、永久复用。

> 一句话先记住:**slash command 是 prompt 模板 + 元数据 + 可选脚本的封装**。它不是新功能,是"把一段话存起来,随时一秒贴出来"。但配上 frontmatter、`$ARGUMENTS`、`!` shell 注入,它能干的远超"模板"二字。

---

## 一、最小 slash command:一分钟入门

新建 `.claude/commands/review.md`(项目级)或 `~/.claude/commands/review.md`(用户级):

```markdown
请审查当前的 git diff,关注:
- bug / 边界 / 死锁
- 性能问题
- 命名 / 风格不一致
- 是否需要补测试

最后给一个"建议合并 / 需要修改"结论。
```

完成。打开 Claude Code 输 `/review`,这段内容就当成你的 prompt 发出去。

> **slash 命令的本质就这么简单**——一个 markdown 文件就是一条命令。后面的所有特性都是这个起点的增强。

---

## 二、命名与命名空间

| 路径 | 触发方式 | 范围 |
| --- | --- | --- |
| `~/.claude/commands/review.md` | `/review` | 用户级,所有项目都可用 |
| `.claude/commands/review.md` | `/review` | 项目级,本项目可用 |
| `.claude/commands/git/review.md` | `/git:review` 或 `/review`(非冲突时) | 命名空间 = 子目录名 |
| `~/.claude/commands/security/audit.md` | `/security:audit` | 用户级带命名空间 |

**用户级 vs 项目级**:

- **个人通用的**(写注释、翻译、commit message)→ 用户级
- **本项目特定的**(本项目的部署流程、本项目的 review checklist)→ 项目级,提交进 git

**命名冲突**:同名时**项目级覆盖用户级**。这套优先级和 settings 一样。

---

## 三、frontmatter:让 slash 变成"带参数的工具"

光是 prompt 模板还不够,加上 frontmatter 才好用。

```markdown
---
description: 审查当前 PR 的安全风险
argument-hint: [--strict] [pr-number]
allowed-tools: Bash(git diff:*), Bash(gh pr view:*), Read
model: claude-opus-4-7
---

请审查 #{1} 这个 PR(参数:$ARGUMENTS)

先跑一下:
!`gh pr diff #{1}`

然后按以下维度检查:
- 鉴权 / 注入 / 越权
- 密钥泄漏
- 依赖供应链风险

@.claude/checklists/security.md
```

每个字段的作用:

| 字段 | 作用 |
| --- | --- |
| `description` | `/help` 时显示给用户的说明 |
| `argument-hint` | 输 `/review ` 后自动补全提示参数 |
| `allowed-tools` | **这个 slash 在执行期间能用的工具白名单**(覆盖全局 permissions)|
| `model` | 这条 slash 强制用某个模型(典型:复杂的用 opus,小动作用 haiku) |
| `disable-model-invocation` | `true` 表示禁止 LLM 主动调这个 slash(只能用户输) |

> 最有价值的是 `allowed-tools`:写一个"自动 commit + push"slash,只允许它用 git 相关命令、不允许跑 rm,**就算 prompt 出了 bug 也炸不出大事故**。

---

## 四、参数:`$ARGUMENTS`、`$1`、`$2`、`$@`

slash 后面接的内容会通过几种方式传进 prompt:

| 占位符 | 含义 |
| --- | --- |
| `$ARGUMENTS` 或 `$@` | 整个参数串 |
| `$1`、`$2`、…… | 按位置切的参数 |
| `${1:-default}` | 缺省值(shell 风格) |

例子:

`.claude/commands/translate.md`:

```markdown
---
description: 翻译文本
argument-hint: <text> [target-lang]
---

把下面的文字翻译成 ${2:-英文}:

$1
```

用法:

```
/translate "你好世界"             # 默认翻成英文
/translate "你好世界" 日文          # 翻成日文
```

> **多参数时务必给 `argument-hint`**——LLM 用户和真人用户都受益。

---

## 五、`!` 注入 shell 命令、`@` 注入文件

slash 文件里有两种"动态内容"语法,跟 prompt 一起渲染。

### 5.1 `!` 跑命令、把 stdout 塞进 prompt

```markdown
当前 git 状态:
!`git status -s`

最近三个 commit:
!`git log --oneline -3`

请基于上面的状态总结改动方向。
```

**重要**:

- `!` 后面的命令会真的执行,output 替换进 prompt
- 仍然受 `allowed-tools` 约束;没在白名单里的命令会被拒
- 想在 slash 里跑 `gh pr view`,得在 frontmatter 加 `allowed-tools: Bash(gh pr view:*)`

### 5.2 `@` 把文件内容贴进来

```markdown
请按这份 checklist 审查代码:

@.claude/checklists/code-review.md

当前改动:
!`git diff`
```

`@.claude/checklists/code-review.md` 会被替换成那个文件的内容。**这是最干净的"复合 slash"写法**——把 checklist、prompt 模板、命令分开管理。

> 写一个稍微大点的 slash,常见结构:**主 slash 调度 + checklist 文件 @进来 + 命令 ! 跑出来 + 参数 $1 串起来**。

---

## 六、常见模板(可以直接 copy)

### 6.1 `/commit` 智能提交

`.claude/commands/commit.md`:

```markdown
---
description: 检查改动并生成 commit message,确认后提交
argument-hint: [scope]
allowed-tools: Bash(git status), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*)
---

我要提交当前改动。先看一下:
!`git status`
!`git diff --staged`

如果没暂存,看 working tree:
!`git diff`

参考最近 5 条 commit 的风格:
!`git log --oneline -5`

帮我 stage 合适的文件并给一条 commit message(scope: ${1:-自动判断})。
**不要直接提交,先把命令展示给我确认**。
```

### 6.2 `/review` PR 审查

`.claude/commands/review.md`:

```markdown
---
description: 审查 PR 或当前分支的改动
argument-hint: [pr-number]
allowed-tools: Bash(gh pr view:*), Bash(gh pr diff:*), Bash(git diff:*), Read, Grep
---

如果传了 PR 号 ($1),用 `gh pr diff $1`;否则用当前分支 diff against main。

按以下顺序检查并给结论:

@.claude/checklists/review.md

最后输出格式:
- ✅ 可合并 / ⚠️ 有问题需修改 / ❌ 不建议合并
- 主要问题列表(按严重度排)
- 建议改进点
```

`.claude/checklists/review.md`:

```markdown
1. 正确性:逻辑、边界、空值、并发
2. 测试:有没有覆盖、有没有跑通
3. 性能:N+1、嵌套循环、不必要的 IO
4. 安全:注入、越权、密钥
5. 可读性:命名、抽象、注释
6. 兼容:向后兼容、API 改变
```

### 6.3 `/explain` 解释代码

`~/.claude/commands/explain.md`(用户级,所有项目可用):

```markdown
---
description: 解释指定文件或代码片段
argument-hint: <file-or-code>
allowed-tools: Read, Glob
---

请用中文解释 $1 的:
1. 整体作用是什么
2. 关键的 5 个点
3. 容易踩坑的地方
4. 如何与系统其他部分配合
```

---

## 七、slash command 与 hook、skill 的区别(经常被混)

| 维度 | Slash Command | Hook | Skill |
| --- | --- | --- | --- |
| **触发方式** | 用户主动输 `/xxx` | 生命周期事件自动触发 | LLM 按描述匹配后调用 |
| **运行内容** | prompt 模板 + 命令注入 | 任意脚本(bash / python / node) | prompt 模板 + 资源文件 + 子脚本 |
| **谁能改** | 任何能改文件的人 | settings.json 里写 | `~/.claude/skills/xxx/` 目录 |
| **典型例子** | `/review`、`/translate` | 改文件后自动 lint | "审 PR"、"做安全审查"、"配 settings" |

**怎么选**:

- 我**手动**触发,每次差不多 → slash command
- 我希望它**自动**在某事件后跑(改文件后 / commit 前 / session 结束) → hook
- 我希望 LLM **看到合适场景自己**就用上 → skill

> 最常见错配:**写了一堆 slash 但 LLM 不会主动调**。slash 是给"你"用的;让 LLM 自动用,**写成 skill**(第 8 篇)。

---

## 八、SlashCommand 工具:LLM 主动调 slash

LLM 内部有个 `SlashCommand` 工具,可以**主动**调你的 slash。

```
用户: 帮我审一下当前 PR
LLM: (调 SlashCommand: /review)
     ...按 review.md 的流程跑
```

frontmatter 里 `disable-model-invocation: true` 可以禁止——某些 slash 是给真人用的,别让 LLM 乱调。

---

## 九、调试 slash command

1. **`/help`**:列出所有可用 slash + description
2. **`Ctrl+R`**:看 transcript,确认 slash 渲染后的实际 prompt 长什么样(`!` 和 `@` 替换都能看到)
3. **`allowed-tools` 没生效**:确认有没有 typo,`Bash(git diff:*)` 写错成 `Bash(git diff*)` 是常见错误
4. **`!` 命令报错**:slash 整个执行链断,**先在 shell 里跑一遍 `!` 里的命令**确保对
5. **`@` 找不到文件**:路径相对于**项目根目录**(项目级 slash)或**用户家目录**(用户级 slash)

---

## 十、踩坑

1. **写得太具体,只用一次**——这种就别做成 slash,直接打字快。**反复用 5+ 次的才值得**
2. **没写 frontmatter description**——`/help` 列表里你的 slash 显示一行空白,过两个月自己都忘了
3. **`!` 跑 `rm` / `mv` 这种破坏性命令**——slash 文件被人偷偷改,你一调就执行;**`allowed-tools` 务必精确**
4. **`$ARGUMENTS` 和 `$1` 混着用**——一会儿整体一会儿位置,LLM 看了都迷;**统一一种**
5. **slash 名字和内置 slash 重了**(比如自己写个 `/init` 覆盖官方)——会盖掉官方功能,要么换名要么用命名空间
6. **`@` 路径不对**——项目级用项目相对路径,用户级用用户家相对路径;**绝对路径最稳**
7. **slash 里塞太长 prompt**——几百行的 slash 就该拆成 `@checklist1.md` `@checklist2.md` 多文件组合
8. **`allowed-tools` 直接写 `Bash`**——跟没写差不多,起码到子命令级
9. **不放进 git**——团队 review checklist 写成 slash 但不提交,别人看不到也用不上;**项目级一律提交**
10. **不用 `disable-model-invocation`**——给真人用的 slash 被 LLM 自动调起来,有时会绕过你的预期检查

---

下一篇:`05-Hooks钩子系统.md`,讲八种 hook 类型(PreToolUse / PostToolUse / UserPromptSubmit / Stop / Notification / SubagentStop / WorktreeCreate / WorktreeRemove)、JSON 协议、阻断机制、典型用例(自动格式化、提交检查、敏感命令拦截)。
